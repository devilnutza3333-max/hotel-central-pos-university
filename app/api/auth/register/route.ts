import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { authAccounts, registrationRequests, users } from "../../../../db/schema";
import { createPasswordHash } from "../../../local-auth";
import { ensureRegistrationStorage } from "../../../registration-storage";

function newPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, value => alphabet[value % alphabet.length]).join("");
}

export async function POST(request: Request) {
  if ((env as unknown as { AUTH_PROVIDER?: string }).AUTH_PROVIDER !== "local") {
    return NextResponse.json({ error: "ปิดการสมัครสมาชิกในโหมดนี้" }, { status: 403 });
  }
  if (Number(request.headers.get("content-length") || 0) > 4096) {
    return NextResponse.json({ error: "ข้อมูลมีขนาดใหญ่เกินไป" }, { status: 413 });
  }
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "ข้อมูลสมัครสมาชิกไม่ถูกต้อง" }, { status: 400 });
  }
  const values = body as Record<string, unknown>;
  const field = (key: string) => typeof values[key] === "string" ? (values[key] as string).trim() : "";
  const memberType = field("memberType");
  const phone = field("phone").replace(/[\s-]/g, "");
  const fullName = field("fullName");
  const program = field("program");
  const yearLevel = field("yearLevel");
  if (!["student", "teacher"].includes(memberType) || !/^0[0-9]{9}$/.test(phone)) {
    return NextResponse.json({ error: "กรุณาระบุเบอร์โทรศัพท์ 10 หลักให้ถูกต้อง" }, { status: 400 });
  }
  if (memberType === "student" && (program.length < 2 || program.length > 100 || !/^[1-6]$/.test(yearLevel))) {
    return NextResponse.json({ error: "กรุณาระบุสาขาและชั้นปี" }, { status: 400 });
  }
  if (memberType === "teacher" && (fullName.length < 2 || fullName.length > 100)) {
    return NextResponse.json({ error: "กรุณาระบุชื่ออาจารย์" }, { status: 400 });
  }
  const isTeacher = memberType === "teacher";
  const username = phone;
  const password = newPassword();
  const name = isTeacher ? fullName : `นักศึกษา ${program} ปี ${yearLevel} (โทร. ${phone.slice(-4)})`;
  const now = new Date();
  const userId = "reg_" + crypto.randomUUID();
  try {
    await ensureRegistrationStorage();
    const db = getDb();
    const [taken] = await db.select({ userId: authAccounts.userId }).from(authAccounts)
      .where(eq(authAccounts.username, username)).limit(1);
    if (taken) return NextResponse.json({ error: "เบอร์โทรนี้สมัครไว้แล้ว กรุณาติดต่ออาจารย์หากลืมรหัสผ่าน" }, { status: 409 });
    const passwordData = await createPasswordHash(password);
    await db.batch([
      db.insert(users).values({
        id: userId, email: `${phone}@local.pos`, name, role: "student",
        active: !isTeacher, lastSeenAt: now, createdAt: now,
      }),
      db.insert(authAccounts).values({
        userId, username, ...passwordData, failedAttempts: 0, createdAt: now, updatedAt: now,
      }),
      db.insert(registrationRequests).values({
        userId, memberType: isTeacher ? "teacher" : "student", schoolId: "",
        program: isTeacher ? "" : program, yearLevel: isTeacher ? "" : yearLevel,
        phone, status: "pending", createdAt: now,
      }),
    ]);
    return NextResponse.json({
      ok: true, username, password, memberType, approved: !isTeacher,
      message: isTeacher
        ? "ส่งคำขออาจารย์แล้ว รอผู้ดูแลตรวจสอบและอนุมัติสิทธิ์ทั้งหมด"
        : "สมัครนักศึกษาสำเร็จ เข้าใช้สิทธิ์พื้นฐานได้ทันที อาจารย์จะมอบหมายสิทธิ์ฝึกผู้จัดการภายหลัง",
    }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("POS_REGISTRATION_FAILED", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "ไม่สามารถสมัครได้ กรุณาตรวจสอบเบอร์โทรซ้ำหรือลองใหม่" }, { status: 409, headers: { "cache-control": "no-store" } });
  }
}
