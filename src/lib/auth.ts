import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

function sessionSecret(): string | null {
  const secret = process.env.KANBAN_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const calc = scryptSync(password, salt, 32);
  const expect = Buffer.from(hash, "hex");
  return calc.length === expect.length && timingSafeEqual(calc, expect);
}

const sign = (payload: string, secret: string) =>
  createHmac("sha256", secret).update(payload).digest("base64url");

/** 签发会话 token：uid.过期时间戳.HMAC */
export function createSessionToken(uid: string, days = 180): string {
  const secret = sessionSecret();
  if (!secret) throw new Error("KANBAN_SECRET must contain at least 32 characters");
  const payload = `${uid}.${Date.now() + days * 86400000}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token: string | undefined): string | null {
  const secret = sessionSecret();
  if (!token || !secret) return null;
  const i = token.lastIndexOf(".");
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  if (!payload || !sig) return null;
  const expect = Buffer.from(sign(payload, secret));
  const got = Buffer.from(sig);
  if (expect.length !== got.length || !timingSafeEqual(expect, got)) return null;
  const [uid, expStr, extra] = payload.split(".");
  const expires = Number(expStr);
  if (!uid || extra !== undefined || !Number.isSafeInteger(expires) || Date.now() >= expires) return null;
  return uid;
}
