import { signJwt } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  if (error) return NextResponse.redirect(`${process.env.BASE_URL}/login?error=${encodeURIComponent(error)}`);
  if (!code) return NextResponse.redirect(`${process.env.BASE_URL}/login?error=missing_code`);

  // Intercambia code por tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return NextResponse.redirect(`${process.env.BASE_URL}/login?error=token_exchange_failed`);
  interface GoogleTokenResponse {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    scope: string;
    token_type: string;
    id_token?: string;
  }
  const tokenJson: GoogleTokenResponse = await tokenRes.json();

  // Pide perfil
  const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userinfoRes.ok) return NextResponse.redirect(`${process.env.BASE_URL}/login?error=userinfo_failed`);
  interface GoogleUserProfile {
    sub: string;
    email: string;
    name: string;
    picture: string;
    email_verified?: boolean;
    locale?: string;
    [key: string]: unknown;
  }
  const prof: GoogleUserProfile = await userinfoRes.json();
  const provider = "google";
  const providerAccountId = prof.sub;

  // Upsert de usuario + cuenta
  const email = prof.email;
  const name = prof.name;
  const image = prof.picture;

  const result = await prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { email } });
    if (!user) {
      user = await tx.user.create({
        data: { email, name, image, emailVerified: new Date() }, // Google ya verificó el email
      });
    } else if (!user.emailVerified) {
      user = await tx.user.update({ where: { id: user.id }, data: { emailVerified: new Date(), name, image } });
    }

    // Vincula/actualiza cuenta
    await tx.account.upsert({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      update: {
        access_token: tokenJson.access_token,
        refresh_token: tokenJson.refresh_token,
        expires_at: tokenJson.expires_in ? Math.floor(Date.now() / 1000) + tokenJson.expires_in : null,
        id_token: tokenJson.id_token,
        scope: tokenJson.scope,
        token_type: tokenJson.token_type,
      },
      create: {
        userId: user.id,
        type: "oauth",
        provider,
        providerAccountId,
        access_token: tokenJson.access_token,
        refresh_token: tokenJson.refresh_token,
        expires_at: tokenJson.expires_in ? Math.floor(Date.now() / 1000) + tokenJson.expires_in : null,
        id_token: tokenJson.id_token,
        scope: tokenJson.scope,
        token_type: tokenJson.token_type,
      },
    });

    return user;
  });

  // Emite JWT de sesión
  const jwt = await signJwt({ sub: String(result.id), email: result.email, provider: "google" });

  // Redirige a tu app con el token (o colócalo en cookie HttpOnly desde aquí si prefieres)
  return NextResponse.redirect(`${process.env.BASE_URL}/oauth-success#token=${jwt}`);
}
