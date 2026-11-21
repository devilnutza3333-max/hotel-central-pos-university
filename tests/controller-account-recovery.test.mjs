import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const load=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const controller=load("../app/api/controller/accounts/route.ts");
const page=load("../app/controller/accounts/page.tsx");
const ui=load("../app/pos-app.tsx");
const api=load("../app/api/pos/route.ts");
const e2e=load("../scripts/test-pos-registration-local.mjs");
test("controller API checks immutable original owner, not shared role",()=>{
  assert.match(controller,/session\.userId !== SYSTEM_CONTROLLER_ID/);
  assert.match(controller,/actor\.role !== "manager"/);
  assert.match(controller,/pos_mgr_cb5d4d0b40dadedb79c21010/);
  assert.doesNotMatch(controller,/profile\.role === "instructor"/);
});
test("controller can see names IDs phones and roles but never hashes or passwords",()=>{
  for(const field of ["username: authAccounts.username","phone: registrationRequests.phone","program: registrationRequests.program","yearLevel: registrationRequests.yearLevel","role: users.role","active: users.active"])assert.ok(controller.includes(field));
  assert.doesNotMatch(controller,/passwordHash: authAccounts\.passwordHash|passwordSalt: authAccounts\.passwordSalt/);
  assert.match(controller,/private, no-store/);
  assert.match(page,/รหัสผ่านเดิมไม่สามารถแสดงได้/);
});
test("password recovery is server-generated, hashed, auditable, and shown one time",()=>{
  assert.match(controller,/crypto\.getRandomValues/);
  assert.match(controller,/await createPasswordHash\(temporaryPassword\)/);
  assert.match(controller,/db\.delete\(authSessions\)/);
  assert.match(controller,/CONTROLLER_PASSWORD_REISSUED/);
  assert.match(controller,/temporaryPassword, active: target\.active/);
  assert.match(page,/setIssued\(null\)/);
  assert.match(page,/คัดลอกรหัสผ่าน/);
});
test("instructors cannot reset the immutable controller or other instructors",()=>{
  assert.match(api,/targetId === "pos_mgr_cb5d4d0b40dadedb79c21010"/);
  assert.match(api,/target\?\.role === "instructor"/);
  assert.match(ui,/href="\/controller\/accounts"/);
  assert.match(ui,/current\.id === "pos_mgr_cb5d4d0b40dadedb79c21010" && current\.role === "manager"/);
  assert.match(e2e,/deniedTeacherRoster\.status,403/);
  assert.match(e2e,/resetRoot\.status,403/);
});
