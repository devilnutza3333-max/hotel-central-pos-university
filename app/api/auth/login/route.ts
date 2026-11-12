import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { authAccounts } from "../../../../db/schema";
import {
  createLocalSession,
  getAccountByUsername,
  normalizeUsername,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  verifyPassword,
} from "../../../local-auth";

const genericError = "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { username?: string; password?: string } | null;
  const username = normalizeUsername(body?.username ?? "");
  const password = body?.password ?? "";
  const account = await getAccountByUsername(username);
  const now = new Date();
  if (!account || (account.lockedUntil && account.lockedUntil > now)) {
    return NextResponse.json({ error: genericError }, { status: 401 });
  }
  const valid = await verifyPassword(
    password,
    account.passwordSalt,
    account.passwordIterations,
    account.passwordHash,
  );
  if (!valid) {
    const failedAttempts = account.failedAttempts + 1;
    await getDb().update(authAccounts).set({
      failedAttempts: failedAttempts >= 5 ? 0 : failedAttempts,
      lockedUntil: failedAttempts >= 5 ? new Date(now.getTime() + 15 * 60 * 1000) : null,
      updatedAt: now,
    }).where(eq(authAccounts.userId, account.userId));
    return NextResponse.json({ error: genericError }, { status: 401 });
  }
  await getDb().update(authAccounts).set({ failedAttempts: 0, lockedUntil: null, updatedAt: now }).where(eq(authAccounts.userId, account.userId));
  const session = await createLocalSession(account.userId);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    expires: session.expiresAt,
  });
  return response;
}
