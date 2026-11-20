import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const load = path => readFileSync(new URL(path, import.meta.url), "utf8");
const signup = load("../app/api/auth/register/route.ts");
const review = load("../app/api/auth/registrations/route.ts");
const schema = load("../drizzle/0016_member_registration.sql");
const ui = load("../app/register/page.tsx");
const team = load("../app/pos-app.tsx");
const api = load("../app/api/pos/route.ts");
const login = load("../app/api/auth/login/route.ts");
const storage = load("../app/registration-storage.ts");
test("students enter program, year, phone only; start with student role", () => {
  for(const field of ["program","yearLevel","phone"]) assert.match(ui,new RegExp(field));
  assert.match(signup,/role: "student"/);
  assert.match(signup,/active: !isTeacher/);
  assert.match(signup,/crypto\.getRandomValues/);
  assert.match(signup,/createPasswordHash\(password\)/);
  assert.doesNotMatch(ui,/name="email"|name="username"|name="schoolId"|name="password"/);
});
test("teachers enter name and phone; no self-approval", () => {
  assert.match(ui,/name="fullName"/);
  assert.match(ui,/name="phone"/);
  assert.match(review,/profile\.role === "instructor"/);
  assert.match(review,/INITIAL_MANAGER_ID/);
  assert.match(review,/member_type = 'teacher'/);
  assert.match(review,/approve \? "instructor" : "student"/);
  assert.match(login,/if \(!profile\?\.active\)/);
});
test("only instructors can promote students to manager", () => {
  assert.match(team,/onRole\(user.id, event.target.value\)/);
  assert.match(api,/if \(profile\.role !== "instructor"\) throw new Error\("เฉพาะอาจารย์เท่านั้น"\)/);
  assert.match(api,/!target\?\.active \|\| target\.role === "instructor"/);
});
test("registration migration is additive and independent of sales", () => {
  assert.match(schema,/CREATE TABLE IF NOT EXISTS registration_requests/);
  assert.match(storage,/CREATE TABLE IF NOT EXISTS registration_requests/);
  assert.match(storage,/INSERT OR IGNORE INTO d1_migrations/);
  assert.doesNotMatch(schema,/\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i);
});
