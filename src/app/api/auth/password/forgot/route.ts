import { base64url } from "@/app/lib/auth";
import { sendEmail } from "@/app/lib/email";
import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const ForgotSchema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const { email } = ForgotSchema.parse(await req.json());
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = base64url(32);
    const expires = new Date(Date.now() + 1000 * 60 * 15); // 15 min
    await prisma.passwordResetToken.create({ data: { userId: user.id, token, expires } });
    const link = `${process.env.BASE_URL}/reset-password?token=${token}`;
    await sendEmail(email, "Recupera tu contraseña", `Link: <a href="${link}">${link}</a>`);
  }
  return NextResponse.json({ ok: true }); // no revelar si el email existe
}
