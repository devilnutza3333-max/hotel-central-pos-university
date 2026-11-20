import { NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { authAccounts, users, registrationRequests } from "../../../../db/schema";
import { createPasswordHash, normalizeUsername, validPassword, validUsername } from "../../../local-auth";

// Public registration is enabled ONLY for the isolated classroom Staging environment.
// Teachers NEVER receive elevated permissions until an existing manager approves them.
const enabled = () => (env as unknown as {AUTH_PROVIDER?: string}).AUTH_PROVIDER === "local";

export async function POST(request: Request) {
  if (!enabled()) return NextResponse.json({ error: "ไม่เปิดรับสมัครผ่านหน้านี้" }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 12000) return NextResponse.json({error:"ข้อมูลยาวเกินไป"},{status:413});
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || Array.isArray(body)) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const get = (key: string) => typeof body[key] === "string" ? (body[key] as string).trim() : "";
  const memberType = get("memberType");
  const name = get("fullName");
  const username = normalizeUsername(get("username"));
  const email = get("email").toLowerCase();
  const phone = get("phone");
  const schoolId = get("schoolId");
  const program = get("program");
  const yearLevel = get("yearLevel");
  const password = typeof body.password === "string" ? body.password : "";
  if (!["teacher","student"].includes(memberType) || name.length < 3 || name.length > 120 ||
      !validUsername(username) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180 ||
      !validPassword(password) || !/^[a-zA-Z0-9-]{3,32}$/.test(schoolId) ||
      program.length < 2 || program.length > 150 || phone.length > 25 ||
      (memberType === "student" && !/^[1-9][0-9]?$/.test(yearLevel))) {
    return NextResponse.json({ error: "กรุณาตรวจสอบข้อมูล รหัสผ่านต้องมี 10–128 ตัวอักษร" }, { status: 400 });
  }
  const db = getDb();
  const [duplicate] = await db.select({id: users.id}).from(users).where(eq(users.email,email)).limit(1);
  const [taken] = await db.select({id: authAccounts.userId}).from(authAccounts).where(eq(authAccounts.username,username)).limit(1);
  if (duplicate || taken) return NextResponse.json({error:"ชื่อผู้ใช้หรืออีเมลนี้มีในระบบแล้ว"},{status:409});
  const id = "reg_" + crypto.randomUUID();
  const now = new Date();
  const hash = await createPasswordHash(password);
  try {
    await db.batch([
      db.insert(users).values({id,email,name,role:"student",active:false,lastSeenAt:now,createdAt:now}),
      db.insert(authAccounts).values({userId:id,username,...hash,failedAttempts:0,createdAt:now,updatedAt:now}),
      db.insert(registrationRequests).values({userId:id,memberType:memberType as "teacher"|"student",schoolId,program,yearLevel:memberType==="student"?yearLevel:"",phone,status:"pending",createdAt:now}),
    ]);
  } catch {
    return NextResponse.json({error:"ไม่สามารถสมัครได้ กรุณาตรวจสอบข้อมูลซ้ำแล้วลองใหม่"},{status:409});
  }
  return NextResponse.json({ok:true,message:"ส่งคำขอสมัครแล้ว กรุณารออาจารย์หรือผู้จัดการอนุมัติก่อนเข้าสู่ระบบ"},{status:201});
}
