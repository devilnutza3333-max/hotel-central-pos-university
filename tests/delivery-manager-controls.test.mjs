import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ui=readFileSync(new URL("../app/delivery-management.tsx",import.meta.url),"utf8");
const app=readFileSync(new URL("../app/pos-app.tsx",import.meta.url),"utf8");
const api=readFileSync(new URL("../app/api/pos/route.ts",import.meta.url),"utf8");
const block=api.slice(api.indexOf('if (action === "setDeliveryStatus")'),api.indexOf('if (action === "createMenu")'));

test("manager and instructor delivery board includes the same dispatch step as students",()=>{
  assert.match(app,/view === "delivery" && management && <DeliveryManagement/);
  assert.match(ui,/order.status === "ready_for_pickup" && <>/);
  assert.match(ui,/status: "out_for_delivery"/);
  assert.match(ui,/รับงานและออกส่ง/);
  assert.match(ui,/ยืนยันรับงาน/);
});
test("server permits manager and instructor to dispatch, while protecting restaurant approval from students",()=>{
  assert.match(block,/const management = isManagement/);
  assert.match(block,/if \(!canHandleDelivery\)/);
  assert.match(block,/if \(!management && !riderAction\)/);
  assert.match(block,/ready_for_pickup: \["out_for_delivery"\]/);
  assert.match(block,/eq\(deliveryOrders.status, "ready_for_pickup"\)/);
});
