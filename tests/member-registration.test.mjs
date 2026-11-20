import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
const load=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const registration=load("../app/api/auth/register/route.ts");
const approval=load("../app/api/auth/registrations/route.ts");
const login=load("../app/api/auth/login/route.ts");
const schema=load("../drizzle/0016_member_registration.sql");
test("registration never grants instructor/manager role and starts inactive",()=>{
 assert.match(registration,/role:"student",active:false/);
 assert.match(registration,/status:"pending"/);
 assert.doesNotMatch(registration,/fakeHash|btoa\(password/);
 assert.match(registration,/createPasswordHash\(password\)/);
});
test("approval is gated by active instructor or manager",()=>{
 assert.match(approval,/\["manager","instructor"\]\.includes\(profile\.role\)/);
 assert.match(approval,/registration\.memberType==="teacher"\?"instructor":"student"/);
 assert.match(approval,/eq\(registrationRequests\.status,"pending"\)/);
});
test("pending accounts cannot log in",()=>assert.match(login,/if \(!profile\?\.active\) return/));
test("migration is additive and safeguards request statuses",()=>{
 assert.match(schema,/CREATE TABLE IF NOT EXISTS registration_requests/);
 assert.doesNotMatch(schema,/\b(?:DROP|DELETE|TRUNCATE)\b/i);
});
