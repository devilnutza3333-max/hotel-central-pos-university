import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const load=(path)=>readFileSync(new URL(path,import.meta.url),"utf8");
const ui=load("../app/pos-app.tsx");
const api=load("../app/api/pos/route.ts");
const e2e=load("../scripts/test-pos-registration-local.mjs");
test("trainee manager retains operational management but not user management",()=>{
  assert.match(ui,/const management = data \? \["instructor", "manager"\]/);
  assert.match(ui,/const canViewUsers = data \? data\.profile\.role === "instructor"/);
  assert.match(ui,/canViewUsers \? \[\{ id: "team"/);
  assert.match(ui,/view === "team" && canViewUsers && <Team/);
  assert.match(ui,/if \(view === "team" && !canViewUsers\) setView\("dashboard"\)/);
});
test("server denies team access and never includes users for promoted student",()=>{
  assert.match(api,/const canViewUsers = profile\.role === "instructor"/);
  assert.match(api,/if \(scope === "team" && !canViewUsers\)/);
  assert.match(api,/status: 403/);
  assert.match(api,/const needsUsers = canViewUsers &&/);
  assert.match(api,/\.\.\.\(needsUsers \? \{ users: userRows \} : \{\}\)/);
});
test("instructor and original controller still see roster; trainee manager never can promote peers",()=>{
  assert.match(api,/profile\.id === "pos_mgr_cb5d4d0b40dadedb79c21010"/);
  assert.match(api,/if \(profile\.role !== "instructor"\) throw new Error\("เฉพาะอาจารย์เท่านั้น"\)/);
  assert.match(e2e,/traineeTeam\.status,403/);
  assert.match(e2e,/controllerTeam\.status,200/);
  assert.match(e2e,/view\.body\?\.users,undefined/);
});
