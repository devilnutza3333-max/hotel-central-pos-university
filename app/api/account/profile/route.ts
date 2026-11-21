import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { authAccounts, memberProfiles, registrationRequests, users } from "../../../../db/schema";
import { getLocalUser } from "../../../local-auth";
import { ensureRegistrationStorage } from "../../../registration-storage";
import { ensureMemberProfileStorage } from "../../../member-profile-storage";

const noStore = { "cache-control": "private, no-store" };
function deny() {
  return NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อนเปิดโปรไฟล์" }, { status: 401, headers: noStore });
}
function profileResponse(data: unknown) {
  return NextResponse.json(data, { headers: noStore });
}

export async function GET() {
  const current = await getLocalUser();
  if (!current) return deny();
  await ensureRegistrationStorage();
  await ensureMemberProfileStorage();
  const db = getDb();
  const [person] = await db.select({
    id: users.id, name: users.name, role: users.role, active: users.active,
  }).from(users).where(eq(users.id, current.userId)).limit(1);
  if (!person?.active) return deny();
  const [account] = await db.select({username: authAccounts.username})
    .from(authAccounts).where(eq(authAccounts.userId, current.userId)).limit(1);
  const [registration] = await db.select({
    phone: registrationRequests.phone, program: registrationRequests.program,
    yearLevel: registrationRequests.yearLevel, memberType: registrationRequests.memberType,
  }).from(registrationRequests).where(eq(registrationRequests.userId, current.userId)).limit(1);
  const [photo] = await db.select({avatarData: memberProfiles.avatarData})
    .from(memberProfiles).where(eq(memberProfiles.userId, current.userId)).limit(1);
  return profileResponse({
    id: person.id, name: person.name, role: person.role, username: account?.username || "",
    phone: registration?.phone || "", program: registration?.program || "",
    yearLevel: registration?.yearLevel || "", memberType: registration?.memberType || "",
    avatarData: photo?.avatarData || "",
  });
}

function validAvatar(data: unknown): data is string {
  if (typeof data !== "string" || data.length < 90 || data.length > 76000) return false;
  const parsed = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if (!parsed || parsed[2].length % 4 !== 0) return false;
  try {
    const bytes = atob(parsed[2]);
    if (bytes.length > 56000 || bytes.length < 64) return false;
    if (parsed[1] === "webp") return bytes.slice(0, 4) === "RIFF" && bytes.slice(8, 12) === "WEBP";
    if (parsed[1] === "png") return bytes.slice(0, 4) === "\x89PNG";
    return bytes.charCodeAt(0) === 0xff && bytes.charCodeAt(1) === 0xd8 && bytes.charCodeAt(2) === 0xff;
  } catch {
    return false;
  }
}

export async function PUT(request: Request) {
  const current = await getLocalUser();
  if (!current) return deny();
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "คำขอจากเว็บไซต์อื่นถูกปฏิเสธ" }, { status: 403, headers: noStore });
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "ชนิดข้อมูลไม่ถูกต้อง" }, { status: 415, headers: noStore });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 85000) {
    return NextResponse.json({ error: "รูปภาพมีขนาดใหญ่เกินไป" }, { status: 413, headers: noStore });
  }
  const data: unknown = await request.json().catch(() => null);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400, headers: noStore });
  }
  const avatarData = (data as Record<string, unknown>).avatarData;
  if (avatarData !== null && !validAvatar(avatarData)) {
    return NextResponse.json({ error: "รองรับเฉพาะภาพ JPG, PNG หรือ WebP ขนาดเล็กเท่านั้น" }, { status: 400, headers: noStore });
  }
  await ensureMemberProfileStorage();
  const d1 = getDb();
  // Server derives user ID solely from the signed session, never from request body.
  await d1.insert(memberProfiles).values({
    userId: current.userId, avatarData: avatarData || "", updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: memberProfiles.userId,
    set: {avatarData: avatarData || "", updatedAt: new Date()},
  });
  return profileResponse({ok: true, avatarData: avatarData || ""});
}
