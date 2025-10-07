import { NextResponse } from "next/server";
import argon2 from "argon2";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { base64url, signJwt } from "@/app/lib/auth";
import { sendEmail } from "@/app/lib/email";

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email ya registrado" }, { status: 409 });
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await prisma.user.create({
    data: { email, passwordHash, name },
  });

  // Genera token de verificación y envía correo
  const token = base64url(32);
  const expires = new Date(Date.now() + 1000 * 60 * 60); // 1h
  await prisma.verificationToken.create({
    data: { identifier: email, token, expires },
  });
  const verifyLink = `${process.env.BASE_URL}/api/auth/verify-email?identifier=${encodeURIComponent(email)}&token=${token}`;
  await sendEmail(email, "Verifica tu email", `Haz click para verificar: <a href="${verifyLink}">${verifyLink}</a>`);

  // Opcional: emitir JWT para sesión inmediata (aunque no verificado)
  const jwt = await signJwt({ sub: String(user.id), email, emailVerified: !!user.emailVerified });

  return NextResponse.json({ user: { id: user.id, email }, token: jwt }, { status: 201 });
}
