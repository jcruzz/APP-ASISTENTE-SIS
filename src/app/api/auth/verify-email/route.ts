import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const identifier = searchParams.get("identifier");
  const token = searchParams.get("token");
  if (!identifier || !token) return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });

  const record = await prisma.verificationToken.findUnique({ where: { token } });
  if (!record || record.identifier !== identifier) {
    return NextResponse.json({ error: "Token inválido" }, { status: 400 });
  }
  if (record.expires < new Date()) {
    return NextResponse.json({ error: "Token expirado" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { email: identifier },
      data: { emailVerified: new Date() },
    }),
    prisma.verificationToken.delete({ where: { token } }),
  ]);

  // redirige a UI (login o dashboard)
  return NextResponse.redirect(`${process.env.BASE_URL}/login?verified=1`);
}
