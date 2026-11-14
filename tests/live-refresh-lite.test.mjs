import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync(new URL("../app/api/pos/route.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../app/pos-app.tsx", import.meta.url), "utf8");
const get = api.slice(api.indexOf("export async function GET("), api.indexOf("export async function POST("));

test("background live refresh requests omit constant catalogue and settings", () => {
  assert.match(ui, /mode === "live" \? "&mode=live" : ""/);
  assert.match(ui, /await load\(true, true, undefined, "live"\);/);
  assert.match(get, /const isLiveRefresh = params\.get\("mode"\) === "live"/);
  assert.match(get, /!isLiveRefresh \? db\.select\(\)\.from\(menuItems\)/);
  assert.match(get, /!isLiveRefresh \? db\.select\(\)\.from\(appSettings\)/);
  assert.match(get, /\.\.\.\(!isLiveRefresh \? \{ menu: menuRows\.map\(withImage\) \} : \{\}\)/);
});
test("core order, kitchen and service data remain live in all scopes", () => {
  assert.match(get, /orders: orderRows/);
  assert.match(get, /items: itemRows/);
  assert.match(get, /tables: tableRows\.map/);
  assert.match(get, /serviceRequests: serviceRows/);
  assert.match(get, /printQueueJobs: printQueueRows\.map/);
  assert.match(ui, /const fastScreen = \["kitchen", "bar", "service", "host", "delivery"\]/);
});
