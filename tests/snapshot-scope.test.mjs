import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync(new URL("../app/api/pos/route.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../app/pos-app.tsx", import.meta.url), "utf8");
const get = api.slice(api.indexOf("export async function GET("), api.indexOf("export async function POST("));

test("operational snapshots exclude closed orders, while finance/dashboard keep history", () => {
  assert.match(get, /includeClosedOrderHistory = \["finance", "dashboard", "audit", "operations", "readiness"\]\.includes\(scope\)/);
  assert.match(get, /inArray\(orders\.status, \[\.\.\.activeOrderStatuses\]\)/);
  assert.match(get, /db\.select\(\)\.from\(orders\)\.where\(orderFilter\)/);
  assert.match(get, /db\.select\(\{ id: orders\.id \}\)\.from\(orders\)[\s\S]*?\.where\(orderFilter\)/);
});

test("receipt details and stock count lines use bounded parent windows", () => {
  assert.match(get, /\.from\(stockReceiptItems\)\.where\(inArray\([\s\S]*?\.from\(stockReceipts\)[\s\S]*?\.limit\(500\)/);
  assert.match(get, /\.from\(stockCountLines\)\.where\(inArray\([\s\S]*?\.from\(stockCountSessions\)[\s\S]*?\.limit\(60\)/);
});

test("finance and audit snapshots cannot be silently overwritten by tables polling", () => {
  assert.match(ui, /if \(\["finance", "audit"\]\.includes\(viewRef\.current\)\) return;/);
  assert.match(ui, /await load\(true, true\);/);
});
