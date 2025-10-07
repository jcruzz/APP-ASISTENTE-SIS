import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
    return NextResponse.json({
        status: "ok",
        service: "asistente-digital",
        now: new Date().toISOString(),
    })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return NextResponse.json({
    status: "ok",
    received: body,
    now: new Date().toISOString(),
  });
}