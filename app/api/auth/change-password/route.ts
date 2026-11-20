import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { authAccounts, authSessions } from "../../../../db/schema";
import {
  createPasswordHash, getLocalUser, SESSION_COOKIE, validPassword, verifyPassword,
} from "../../../local-auth";

/**
 * Every active member (student, cashier, trainee-manager and teacher)
 * can change only their own password. Old password is always required.
 */
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 415 });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "ไม่อนุญาตคำขอจากเว็บไซต์อื่น" }, { status: 403 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 4096) {
    return NextResponse.json({ error: "ข้อมูลมีขนาดใหญ่เกินไป" }, { status: 413 });
  }
  const currentUser = await getLocalUser();
  if (!currentUser) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const fields = body as Record<string, unknown>;
  const oldPassword = fields.oldPassword;
  const newPassword = fields.newPassword;
  const confirmPassword = fields.confirmPassword;
  if (typeof oldPassword !== "string" || typeof newPassword !== "string" ||
      typeof confirmPassword !== "string" || !validPassword(newPassword) ||
      newPassword !== confirmPassword || newPassword === oldPassword) {
    return NextResponse.json({ error: "รหัสใหม่ต้องมี 10–128 ตัวอักษร ตรงกับช่องยืนยัน และต่างจากรหัสเดิม" }, { status: 400 });
  }

  const db = getDb();
  const [account] = await db.select().from(authAccounts)
    .where(eq(authAccounts.userId, currentUser.userId)).limit(1);
  if (!account || (account.lockedUntil && account.lockedUntil > new Date())) {
    return NextResponse.json({ error: "ไม่สามารถเปลี่ยนรหัสผ่านได้ในขณะนี้" }, { status: 403 });
  }

  const verified = await verifyPassword(
    oldPassword, account.passwordSalt, account.passwordIterations, account.passwordHash,
  );
  if (!verified) return NextResponse.json({ error: "รหัสผ่านเดิมไม่ถูกต้อง" }, { status: 403 });

  const passwordData = await createPasswordHash(newPassword);
  const now = new Date();
  await db.batch([
    db.update(authAccounts).set({
      ...passwordData, failedAttempts: 0, lockedUntil: null, updatedAt: now,
    }).where(eq(authAccounts.userId, currentUser.userId)),
    db.delete(authSessions).where(eq(authSessions.userId, currentUser.userId)),
  ]);
  const response = NextResponse.json({ ok: true, redirect: "/login?password_changed=1" }, {
    headers: { "cache-control": "no-store" },
  });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0,
  });
  return response;
}
