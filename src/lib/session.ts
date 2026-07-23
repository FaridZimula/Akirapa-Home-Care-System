import crypto from 'crypto';
import { cookies } from 'next/headers';
import { prisma } from './prisma';

export const SESSION_COOKIE_NAME = 'akirapa_session';

const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes, matches AuthContext idle timeout

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable must be set to sign session cookies.');
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET as string).update(payload).digest('base64url');
}

function encodeToken(userId: string, exp: number): string {
  const encoded = Buffer.from(JSON.stringify({ sub: userId, exp }), 'utf8').toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

function decodeToken(token: string): { sub: string; exp: number } | null {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'CARE_COORDINATOR' | 'CAREGIVER' | 'FAMILY_MEMBER';
  phoneNumber: string | null;
}

export function createSessionCookie(userId: string): { name: string; value: string; maxAge: number } {
  const exp = Date.now() + SESSION_TTL_MS;
  return {
    name: SESSION_COOKIE_NAME,
    value: encodeToken(userId, exp),
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

// Standard cookie options for setting the session cookie on a NextResponse.
export function sessionCookieOptions(maxAge: number) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge,
  };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = decodeToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    phoneNumber: user.phoneNumber,
  };
}
