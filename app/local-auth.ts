import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../db";
import { authAccounts, authSessions, users } from "../db/schema";

export const SESSION_COOKIE = "hotel_pos_session";
// Cloudflare Workers currently caps WebCrypto PBKDF2 at 100,000 iterations.
export const PASSWORD_ITERATIONS = 100000;
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type LocalUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function validUsername(value: string): boolean {
  return /^[a-z0-9._-]{3,32}$/.test(value);
}

export function validPassword(value: string): boolean {
  return value.length >= 10 && value.length <= 128;
}

export async function createPasswordHash(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return {
    passwordHash: encodeBase64Url(hash),
    passwordSalt: encodeBase64Url(salt),
    passwordIterations: PASSWORD_ITERATIONS,
  };
}

export async function verifyPassword(
  password: string,
  saltValue: string,
  iterations: number,
  expectedHash: string,
): Promise<boolean> {
  const salt = decodeBase64Url(saltValue);
  const actual = await derivePassword(password, salt, iterations);
  const expected = decodeBase64Url(expectedHash);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual[index] ^ expected[index];
  }
  return difference === 0;
}

export async function createLocalSession(userId: string) {
  const token = encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const sessionId = await hashSessionToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
  await getDb().insert(authSessions).values({
    id: sessionId,
    userId,
    expiresAt,
    createdAt: now,
    lastSeenAt: now,
  });
  return { token, expiresAt };
}

export async function getLocalUser(): Promise<LocalUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const sessionId = await hashSessionToken(token);
  const db = getDb();
  const now = new Date();
  const [session] = await db
    .select()
    .from(authSessions)
    .where(and(eq(authSessions.id, sessionId), gt(authSessions.expiresAt, now)))
    .limit(1);
  if (!session) return null;
  const [profile] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!profile?.active) return null;
  if (now.getTime() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await db.update(authSessions).set({ lastSeenAt: now }).where(eq(authSessions.id, sessionId));
  }
  return {
    userId: profile.id,
    displayName: profile.name,
    email: profile.email,
    fullName: profile.name,
  };
}

export async function deleteCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return;
  await getDb().delete(authSessions).where(eq(authSessions.id, await hashSessionToken(token)));
}

export async function getAccountByUsername(username: string) {
  return (await getDb().select().from(authAccounts).where(eq(authAccounts.username, username)).limit(1))[0] ?? null;
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt.buffer as ArrayBuffer, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return encodeBase64Url(new Uint8Array(digest));
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
