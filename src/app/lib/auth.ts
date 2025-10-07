import * as jose from "jose";
import crypto from "crypto";

export function base64url(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

export async function signJwt(payload: Record<string, unknown>, exp = "2h") {
  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(SECRET);
}

export async function verifyJwt(token: string) {
  const { payload } = await jose.jwtVerify(token, SECRET);
  return payload;
}
