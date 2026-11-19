import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const api=readFileSync(new URL("../app/api/pos/route.ts",import.meta.url),"utf8");
const delivery=readFileSync(new URL("../app/api/delivery/route.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../drizzle/0015_delivery_perf_indexes.sql",import.meta.url),"utf8");
const get=api.slice(api.indexOf("export async function GET("),api.indexOf("export async function POST("));
test("delivery board retains up to 250 active orders while bounding their items",()=>{
 assert.match(get,/needsDeliveryItems\s*\?\s*db\.select\(\)\.from\(deliveryOrderItems\)\.where\(inArray\(/);
 assert.match(get,/DELIVERY_BOARD_LIMIT = 250/);
 assert.match(get,/\.where\(inArray\(deliveryOrders\.status, \[\.\.\.activeDeliveryStatuses\]\)\)/);
 assert.match(get,/\.limit\(DELIVERY_BOARD_LIMIT\)/);
});
test("phone lookup uses index and includes ready-for-pickup among active deliveries",()=>{
 assert.match(delivery,/\.from\(deliveryOrders\)\.where\(and\(eq\(deliveryOrders\.phone, phone\), inArray\(deliveryOrders\.status, \[[^\]]*ready_for_pickup/);
 assert.match(delivery,/\.limit\(3\)/);
 assert.match(migration,/CREATE INDEX IF NOT EXISTS delivery_orders_phone_status_idx/);
 assert.match(migration,/CREATE INDEX IF NOT EXISTS delivery_orders_recent_idx/);
 assert.doesNotMatch(migration,/\b(?:DELETE|DROP TABLE|TRUNCATE)\b/i);
});
