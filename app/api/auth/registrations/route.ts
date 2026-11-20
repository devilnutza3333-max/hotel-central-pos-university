import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { registrationRequests, users } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { ensureRegistrationStorage } from "../../../registration-storage";

// The original bootstrap manager may approve the first teacher.
// A student promoted to manager cannot approve teachers or grant instructor privileges.
const INITIAL_MANAGER_ID = "pos_mgr_cb5d4d0b40dadedb79c21010";
async function approver() {
  if ((env as unknown as { AUTH_PROVIDER?: string }).AUTH_PROVIDER !== "local") return null;
  const auth = await getChatGPTUser();
  if (!auth) return null;
  const [profile] = await getDb().select().from(users).where(eq(users.id, auth.userId)).limit(1);
  if (!profile?.active || !(profile.role === "instructor" || (profile.role === "manager" && profile.id === INITIAL_MANAGER_ID))) return null;
  return profile;
}

export async function GET() {
  const actor = await approver();
  if (!actor) return NextResponse.json({ error: "เฉพาะอาจารย์หรือผู้ดูแลหลักเท่านั้น" }, { status: 403 });
  await ensureRegistrationStorage();
  const requests = await getDb().select({
    userId: registrationRequests.userId, memberType: registrationRequests.memberType,
    program: registrationRequests.program, yearLevel: registrationRequests.yearLevel,
    phone: registrationRequests.phone, status: registrationRequests.status,
    createdAt: registrationRequests.createdAt, name: users.name,
  }).from(registrationRequests).innerJoin(users, eq(users.id, registrationRequests.userId))
    .where(and(eq(registrationRequests.memberType, "teacher"), eq(registrationRequests.status, "pending")))
    .orderBy(desc(registrationRequests.createdAt)).limit(100);
  return NextResponse.json({ requests }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request) {
  const actor = await approver();
  if (!actor) return NextResponse.json({ error: "ไม่มีสิทธิ์อนุมัติบัญชีอาจารย์" }, { status: 403 });
  const body = await request.json().catch(() => null) as { userId?: unknown; decision?: unknown } | null;
  if (typeof body?.userId !== "string" || !/^reg_[a-f0-9-]{36}$/.test(body.userId)
      || !["approve","reject"].includes(String(body.decision))) {
    return NextResponse.json({ error: "ข้อมูลคำขอไม่ถูกต้อง" }, { status: 400 });
  }
  await ensureRegistrationStorage();
  const userId = body.userId;
  const approve = body.decision === "approve";
  const d1 = env.DB;
  if (!d1) return NextResponse.json({ error: "ฐานข้อมูล POS ไม่พร้อมใช้งาน" }, { status: 503 });
  const [userUpdate, requestUpdate] = await d1.batch([
    d1.prepare(`UPDATE users SET role = ?, active = ?
      WHERE id = ? AND EXISTS
      (SELECT 1 FROM registration_requests WHERE user_id = ? AND status = 'pending' AND member_type = 'teacher')`)
      .bind(approve ? "instructor" : "student", approve ? 1 : 0, userId, userId),
    d1.prepare(`UPDATE registration_requests SET status = ?, reviewed_at = ?, reviewed_by = ?
      WHERE user_id = ? AND status = 'pending' AND member_type = 'teacher'`)
      .bind(approve ? "approved" : "rejected", Math.floor(Date.now() / 1000), actor.id, userId),
  ]);
  if (requestUpdate.meta.changes !== 1 || userUpdate.meta.changes !== 1) {
    return NextResponse.json({ error: "รายการนี้ถูกดำเนินการไปแล้ว" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, status: approve ? "approved" : "rejected" }, { headers: { "cache-control": "no-store" } });
}
