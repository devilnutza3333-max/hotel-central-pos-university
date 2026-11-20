import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { registrationRequests, users } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";

async function manager() {
  if ((env as unknown as {AUTH_PROVIDER?:string}).AUTH_PROVIDER !== "local") return null;
  const auth = await getChatGPTUser();
  if (!auth) return null;
  const [profile] = await getDb().select().from(users).where(eq(users.id, auth.userId)).limit(1);
  return profile?.active && ["manager","instructor"].includes(profile.role) ? profile : null;
}
export async function GET() {
  if (!await manager()) return NextResponse.json({error:"ไม่มีสิทธิ์"},{status:403});
  const rows = await getDb().select({
    userId: registrationRequests.userId,
    memberType: registrationRequests.memberType,
    schoolId: registrationRequests.schoolId,
    program: registrationRequests.program,
    yearLevel: registrationRequests.yearLevel,
    status: registrationRequests.status,
    createdAt: registrationRequests.createdAt,
    name: users.name,
    email: users.email,
  }).from(registrationRequests).innerJoin(users,eq(users.id,registrationRequests.userId))
    .orderBy(desc(registrationRequests.createdAt)).limit(100);
  return NextResponse.json({ requests: rows });
}
export async function PATCH(request: Request) {
  const actor = await manager();
  if (!actor) return NextResponse.json({error:"ไม่มีสิทธิ์"},{status:403});
  const data = await request.json().catch(()=>null) as {userId?:unknown;decision?:unknown}|null;
  if (typeof data?.userId !== "string" || !/^reg_[a-f0-9-]{36}$/.test(data.userId) ||
      (data.decision !== "approve" && data.decision !== "reject")) {
    return NextResponse.json({error:"ข้อมูลคำขอไม่ถูกต้อง"},{status:400});
  }
  const db=getDb();
  const [registration]=await db.select().from(registrationRequests)
    .where(and(eq(registrationRequests.userId,data.userId),eq(registrationRequests.status,"pending"))).limit(1);
  if (!registration) return NextResponse.json({error:"คำขอนี้ได้รับการพิจารณาแล้ว"},{status:409});
  const approve=data.decision==="approve";
  // Atomic conditional update: avoid granting a role to a previously processed request.
  const updated=await db.update(registrationRequests).set({
    status: approve?"approved":"rejected", reviewedAt:new Date(), reviewedBy:actor.id,
  }).where(and(eq(registrationRequests.userId,data.userId),eq(registrationRequests.status,"pending"))).returning({id:registrationRequests.userId});
  if (!updated.length) return NextResponse.json({error:"คำขอนี้ได้รับการพิจารณาแล้ว"},{status:409});
  if (approve) {
    await db.update(users).set({
      active:true,
      role:registration.memberType==="teacher"?"instructor":"student",
    }).where(eq(users.id,registration.userId));
  }
  return NextResponse.json({ok:true,status:approve?"approved":"rejected"});
}
