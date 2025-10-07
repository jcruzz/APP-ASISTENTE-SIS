import { base64url } from "@/app/lib/auth";
import { NextResponse } from "next/server";

export async function GET() {
  const state = base64url(16); // guárdalo en cookie si quieres validarlo fuerte
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline", // refresh_token
    prompt: "consent",      // asegura refresh_token la primera vez
  });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
