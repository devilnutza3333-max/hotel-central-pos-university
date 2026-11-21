import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const file=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const profile=file("../app/api/account/profile/route.ts");
const page=file("../app/account/profile/page.tsx");
const app=file("../app/pos-app.tsx");
const logout=file("../app/api/auth/logout/route.ts");
const schema=file("../drizzle/0017_member_profiles.sql");
test("any member can view their own profile and update only their own photo",()=>{
 assert.match(profile,/getLocalUser\(\)/);
 assert.match(profile,/current\.userId/);
 assert.match(profile,/memberProfiles/);
 assert.match(profile,/validAvatar\(avatarData\)/);
 assert.match(profile,/avatarData !== null/);
 assert.match(profile,/onConflictDoUpdate/);
 assert.doesNotMatch(profile,/request\.userId|fields\.userId/);
});
test("photo upload uses small raster format and guards against oversized images",()=>{
 assert.match(profile,/data:image/);
 assert.match(profile,/bytes\.length > 56000/);
 assert.match(page,/canvas\.toDataURL/);
 assert.match(page,/URL\.revokeObjectURL/);
 assert.match(page,/accept="image\/jpeg,image\/png,image\/webp"/);
});
test("header shows avatar link and visible logout on mobile",()=>{
 assert.match(app,/href="\/account\/profile"/);
 assert.match(app,/className="pos-logout-top" action="\/api\/auth\/logout" method="post"/);
 assert.match(app,/memberAvatar/);
 assert.match(page,/\/account\/password/);
 assert.match(page,/className="pos-profile-logout"/);
});
test("logout endpoint invalidates sessions with a 303 redirect",()=>{
 assert.match(logout,/export async function POST/);
 assert.match(logout,/await deleteCurrentSession\(\)/);
 assert.match(logout,/status:303/);
 assert.match(logout,/response\.cookies\.set\(SESSION_COOKIE/);
});
test("avatar migration additive only",()=>{
 assert.match(schema,/CREATE TABLE IF NOT EXISTS member_profiles/);
 assert.doesNotMatch(schema,/\b(?:DROP|TRUNCATE|DELETE FROM)\b/i);
});
