// Update the import path if the prisma file is in a different location, for example:
import { NextResponse } from "next/server";
import argon2 from "argon2";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { signJwt } from "@/app/lib/auth";

const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });

  const ok = await argon2.verify(user.passwordHash, password);
  if (!ok) return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });

  const token = await signJwt({ sub: String(user.id), email: user.email, emailVerified: !!user.emailVerified });
  return NextResponse.json({ token, user: { id: user.id, email: user.email, emailVerified: user.emailVerified } });
}
