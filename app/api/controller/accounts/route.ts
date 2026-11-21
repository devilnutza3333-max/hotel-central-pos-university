import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { auditLogs, authAccounts, authSessions, registrationRequests, users } from "../../../../db/schema";
import { createPasswordHash, getLocalUser } from "../../../local-auth";
import { ensureRegistrationStorage } from "../../../registration-storage";

// This is a unique, pre-existing system controller, not the shared "manager" role.
// Instructors and trainee managers must never gain this credential-recovery capability.
const SYSTEM_CONTROLLER_ID = "pos_mgr_cb5d4d0b40dadedb79c21010";
const noStore = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };

async function requireController() {
  const session = await getLocalUser();
  if (!session || session.userId !== SYSTEM_CONTROLLER_ID) return null;
  const [actor] = await getDb().select({ id: users.id, role: users.role, active: users.active })
    .from(users).where(eq(users.id, session.userId)).limit(1);
  if (!actor?.active || actor.role !== "manager") return null;
  return actor;
}

function randomTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
}

export async function GET() {
  const controller = await requireController();
  if (!controller) return NextResponse.json({ error: "สงวนสิทธิ์เฉพาะผู้ควบคุมระบบหลัก" }, { status: 403, headers: noStore });
  await ensureRegistrationStorage();
  const list = await getDb().select({
    userId: users.id, name: users.name, role: users.role,
    active: users.active, lastSeenAt: users.lastSeenAt,
    username: authAccounts.username, phone: registrationRequests.phone,
    program: registrationRequests.program, yearLevel: registrationRequests.yearLevel,
    memberType: registrationRequests.memberType, registrationStatus: registrationRequests.status,
  }).from(users)
    .leftJoin(authAccounts, eq(authAccounts.userId, users.id))
    .leftJoin(registrationRequests, eq(registrationRequests.userId, users.id))
    .orderBy(desc(users.lastSeenAt)).limit(500);
  // Never return password hashes, salts, existing passwords or session tokens.
  return NextResponse.json({ accounts: list, total: list.length }, { headers: noStore });
}

export async function POST(request: Request) {
  const controller = await requireController();
  if (!controller) return NextResponse.json({ error: "สงวนสิทธิ์เฉพาะผู้ควบคุมระบบหลัก" }, { status: 403, headers: noStore });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "ไม่อนุญาตคำขอจากเว็บไซต์อื่น" }, { status: 403, headers: noStore });
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 415, headers: noStore });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 2048) {
    return NextResponse.json({ error: "คำขอมีขนาดใหญ่เกินไป" }, { status: 413, headers: noStore });
  }
  const body = await request.json().catch(() => null) as { action?: unknown; userId?: unknown } | null;
  if (body?.action !== "issueTemporaryPassword" || typeof body.userId !== "string" || body.userId.length > 128 || !body.userId) {
    return NextResponse.json({ error: "ข้อมูลคำขอไม่ถูกต้อง" }, { status: 400, headers: noStore });
  }
  const targetId = body.userId;
  if (targetId === controller.id) {
    return NextResponse.json({ error: "ผู้ควบคุมต้องเปลี่ยนรหัสของตัวเองผ่านหน้าโปรไฟล์" }, { status: 403, headers: noStore });
  }
  const db = getDb();
  const [target] = await db.select({ id: users.id, name: users.name, active: users.active })
    .from(users).where(eq(users.id, targetId)).limit(1);
  const [account] = await db.select({ username: authAccounts.username })
    .from(authAccounts).where(eq(authAccounts.userId, targetId)).limit(1);
  if (!target || !account) return NextResponse.json({ error: "ไม่พบบัญชีนี้" }, { status: 404, headers: noStore });

  // The old password is a one-way PBKDF2 hash and cannot be read back.
  // Issue a fresh random password, show it in this response ONCE, and revoke prior sessions.
  const temporaryPassword = randomTemporaryPassword();
  const newHash = await createPasswordHash(temporaryPassword);
  const now = new Date();
  await db.batch([
    db.update(authAccounts).set({
      ...newHash, failedAttempts: 0, lockedUntil: null, updatedAt: now,
    }).where(eq(authAccounts.userId, targetId)),
    db.delete(authSessions).where(eq(authSessions.userId, targetId)),
    db.insert(auditLogs).values({
      id: crypto.randomUUID(), actorId: controller.id, action: "CONTROLLER_PASSWORD_REISSUED",
      detail: `ผู้ควบคุมออกรหัสใหม่ให้ @${account.username} (ไม่บันทึกรหัสจริง)`, createdAt: now,
    }),
  ]);
  return NextResponse.json({
    ok: true, username: account.username, name: target.name,
    temporaryPassword, active: target.active,
    message: target.active
      ? "ออกรหัสผ่านใหม่สำเร็จ รหัสเก่าใช้ไม่ได้แล้ว และออกจากระบบทุกอุปกรณ์"
      : "ออกรหัสผ่านใหม่สำเร็จ แต่บัญชียังรออนุมัติสิทธิ์ก่อนเข้าสู่ระบบ",
  }, { headers: noStore });
}
