
import { NextResponse } from "next/server";
import { z } from "zod";
import argon2 from "argon2";
import { prisma } from "@/app/lib/prisma";

const ResetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function POST(req: Request) {
  const { token, newPassword } = ResetSchema.parse(await req.json());

  const rec = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!rec || rec.used || rec.expires < new Date()) {
    return NextResponse.json({ error: "Token inválido o expirado" }, { status: 400 });
  }

  const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });

  await prisma.$transaction([
    prisma.user.update({ where: { id: rec.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { token }, data: { used: true } }),
  ]);

  return NextResponse.json({ ok: true });
}
