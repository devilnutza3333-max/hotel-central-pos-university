import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const load=(p)=>readFileSync(new URL(p,import.meta.url),"utf8");
const signup=load("../app/register/page.tsx");
const login=load("../app/login/page.tsx");
const pos=load("../app/pos-app.tsx");
const page=load("../app/account/password/page.tsx");
const api=load("../app/api/auth/change-password/route.ts");
test("native login links work before hydration",()=>{
  assert.match(signup,/<a className="pos-native-login-link" href="\/login">/);
  assert.match(signup,/<a className="pos-register-login" href="\/login">/);
  assert.match(login,/<a href="\/register">/);
});
test("all POS roles have prominent password change link",()=>{
  assert.match(pos,/className="pos-change-password-top" href="\/account\/password"/);
  assert.match(pos,/className="pos-change-password-side" href="\/account\/password"/);
  assert.match(page,/oldPassword/);
  assert.match(page,/confirmPassword/);
});
test("password change requires current user and current password",()=>{
  assert.match(api,/await getLocalUser\(\)/);
  assert.match(api,/await verifyPassword\(/);
  assert.match(api,/!validPassword\(newPassword\)/);
  assert.match(api,/newPassword !== confirmPassword/);
  assert.doesNotMatch(api,/profile\.role === "instructor"|profile\.role === "manager"/);
});
test("password reset is transactional and invalidates all sessions",()=>{
  assert.match(api,/await db\.batch\(\[/);
  assert.match(api,/db\.update\(authAccounts\)/);
  assert.match(api,/db\.delete\(authSessions\)/);
  assert.match(api,/response\.cookies\.set\(SESSION_COOKIE, ""/);
  assert.match(api,/origin !== new URL\(request\.url\)\.origin/);
});
