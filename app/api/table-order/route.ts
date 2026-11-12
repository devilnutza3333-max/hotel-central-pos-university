import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../db";
import { actionRequests, auditLogs, diningTables, menuImages, menuItems, orderItems, orders, serviceRequests } from "../../../db/schema";
import { queueKitchenPrintBatch } from "../../print-queue-server";

const activeOrderStatuses = ["open", "sent", "preparing", "ready", "served"] as const;
function id(prefix: string) { return `${prefix}_${crypto.randomUUID()}`; }

async function getTable(token: string) {
  if (!/^[a-f0-9]{32}$/i.test(token)) return null;
  const [table] = await getDb().select().from(diningTables).where(eq(diningTables.publicToken, token.toLowerCase())).limit(1);
  return table ?? null;
}

async function currentOrder(tableId: number) {
  const [order] = await getDb().select().from(orders).where(and(eq(orders.tableId, tableId), inArray(orders.status, [...activeOrderStatuses]))).orderBy(desc(orders.openedAt)).limit(1);
  return order;
}

async function recalculate(orderId: string, now: Date) {
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new Error("ไม่พบออเดอร์");
  const rows = await db.select().from(orderItems).where(and(eq(orderItems.orderId, orderId), ne(orderItems.status, "void")));
  const subtotal = rows.reduce((sum, row) => sum + (row.unitPrice + row.optionPrice) * row.quantity, 0);
  const discountAmount = order.discountType === "percent"
    ? Math.min(subtotal, Math.round(subtotal * order.discountValue / 10_000))
    : order.discountType === "amount" ? Math.min(subtotal, order.discountValue) : 0;
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const serviceChargeAmount = Math.round(afterDiscount * order.serviceChargeRate / 10_000);
  const vatAmount = Math.round((afterDiscount + serviceChargeAmount) * order.vatRate / 10_000);
  const total = afterDiscount + serviceChargeAmount + vatAmount;
  await db.update(orders).set({ subtotal, discountAmount, serviceChargeAmount, vatAmount, total, updatedAt: now }).where(eq(orders.id, orderId));
}

async function log(tableId: number, action: string, detail: string) {
  await getDb().insert(auditLogs).values({ id: id("log"), actorId: `customer:table:${tableId}`, action, detail, createdAt: new Date() });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const table = await getTable(token);
  if (!table) return NextResponse.json({ error: "QR โต๊ะไม่ถูกต้อง กรุณาสแกน QR ที่โต๊ะอีกครั้ง" }, { status: 404 });
  const db = getDb();
  const order = await currentOrder(table.id);
  const [menus, images, items, requests] = await Promise.all([
    db.select().from(menuItems).where(eq(menuItems.active, true)).orderBy(asc(menuItems.category), asc(menuItems.name)),
    db.select({ menuItemId: menuImages.menuItemId, updatedAt: menuImages.updatedAt }).from(menuImages),
    order ? db.select().from(orderItems).where(and(eq(orderItems.orderId, order.id), ne(orderItems.status, "void"))) : Promise.resolve([]),
    db.select().from(serviceRequests).where(and(eq(serviceRequests.tableId, table.id), inArray(serviceRequests.status, ["open", "acknowledged"]))).orderBy(desc(serviceRequests.createdAt)),
  ]);
  const imageVersion = new Map(images.map((image) => [image.menuItemId, image.updatedAt.getTime()]));
  const { publicToken: _publicToken, ...safeTable } = table;
  void _publicToken;
  return NextResponse.json({
    table: safeTable,
    menu: menus.map((menu) => ({ ...menu, imageUrl: imageVersion.has(menu.id) ? `/api/menu-image?id=${menu.id}&v=${imageVersion.get(menu.id)}` : null })),
    order: order ?? null,
    items,
    requests,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const token = String(body.token ?? "");
    const action = String(body.action ?? "");
    const table = await getTable(token);
    if (!table) throw new Error("QR โต๊ะไม่ถูกต้อง กรุณาสแกนใหม่");
    const db = getDb();
    const now = new Date();
    const clientRequestId = String(body.clientRequestId ?? "");
    let order = await currentOrder(table.id);

    if (/^[a-f0-9-]{20,64}$/i.test(clientRequestId)) {
      const [duplicate] = await db.select({ id: actionRequests.id }).from(actionRequests).where(eq(actionRequests.id, clientRequestId)).limit(1);
      if (duplicate) return NextResponse.json({ ok: true, duplicate: true });
      await db.insert(actionRequests).values({ id: clientRequestId, actorId: `customer:table:${table.id}`, action, createdAt: now });
    }

    if (action === "addItem") {
      const menuItemId = Number(body.menuItemId);
      const [menu] = await db.select().from(menuItems).where(eq(menuItems.id, menuItemId)).limit(1);
      if (!menu?.active || !menu.available) throw new Error("เมนูนี้หมดชั่วคราวหรือปิดขายแล้ว");
      if (!order) {
        const orderId = id("ord");
        const orderNumber = `T${String(table.number).padStart(2, "0")}-${Date.now().toString().slice(-6)}`;
        await db.insert(orders).values({ id: orderId, orderNumber, tableId: table.id, openedBy: `customer:table:${table.id}`, status: "open", subtotal: 0, total: 0, openedAt: now, updatedAt: now });
        await db.update(diningTables).set({ status: "occupied" }).where(eq(diningTables.id, table.id));
        order = await currentOrder(table.id);
      }
      if (!order) throw new Error("เปิดออเดอร์ไม่สำเร็จ");
      const optionSummary = String(body.optionSummary ?? "").trim().slice(0, 160);
      const note = String(body.note ?? "").trim().slice(0, 300);
      const [existing] = !optionSummary && !note ? await db.select().from(orderItems).where(and(eq(orderItems.orderId, order.id), eq(orderItems.menuItemId, menuItemId), eq(orderItems.status, "draft"), eq(orderItems.optionSummary, ""), eq(orderItems.note, ""))).limit(1) : [];
      if (existing) await db.update(orderItems).set({ quantity: Math.min(20, existing.quantity + 1) }).where(eq(orderItems.id, existing.id));
      else await db.insert(orderItems).values({ id: id("item"), orderId: order.id, menuItemId, name: menu.name, unitPrice: menu.price, optionSummary, note, quantity: 1, status: "draft" });
      await recalculate(order.id, now);
      return NextResponse.json({ ok: true });
    }

    if (action === "updateItemDetails") {
      if (!order) throw new Error("ยังไม่มีออเดอร์");
      const itemId = String(body.itemId ?? "");
      const [item] = await db.select().from(orderItems).where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, order.id))).limit(1);
      if (!item || item.status !== "draft") throw new Error("แก้รายละเอียดได้เฉพาะรายการที่ยังไม่ส่งครัว");
      const optionSummary = String(body.optionSummary ?? "").trim().slice(0, 160);
      const note = String(body.note ?? "").trim().slice(0, 300);
      await db.update(orderItems).set({ optionSummary, note }).where(eq(orderItems.id, itemId));
      await recalculate(order.id, now);
      return NextResponse.json({ ok: true });
    }

    if (action === "setQuantity") {
      if (!order) throw new Error("ยังไม่มีออเดอร์");
      const itemId = String(body.itemId ?? "");
      const quantity = Number(body.quantity);
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > 20) throw new Error("จำนวนไม่ถูกต้อง");
      const [item] = await db.select().from(orderItems).where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, order.id))).limit(1);
      if (!item || item.status !== "draft") throw new Error("รายการนี้ส่งเข้าครัวแล้ว กรุณาเรียกพนักงานหากต้องการแก้ไข");
      if (quantity === 0) await db.delete(orderItems).where(eq(orderItems.id, itemId));
      else await db.update(orderItems).set({ quantity }).where(eq(orderItems.id, itemId));
      await recalculate(order.id, now);
      return NextResponse.json({ ok: true });
    }

    if (action === "sendKitchen") {
      if (!order) throw new Error("กรุณาเลือกเมนูก่อน");
      const draft = await db.select({ id: orderItems.id }).from(orderItems).where(and(eq(orderItems.orderId, order.id), eq(orderItems.status, "draft")));
      if (!draft.length) throw new Error("ไม่มีรายการใหม่สำหรับส่งครัว");
      await db.update(orderItems).set({ status: "sent" }).where(and(eq(orderItems.orderId, order.id), eq(orderItems.status, "draft")));
      await db.update(orders).set({ status: "sent", updatedAt: now }).where(eq(orders.id, order.id));
      await queueKitchenPrintBatch(order.id, draft.map((item) => item.id), `customer:table:${table.id}`, now);
      await log(table.id, "CUSTOMER_SEND_KITCHEN", `โต๊ะ ${table.number} ส่งออเดอร์ ${order.orderNumber}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "serviceRequest") {
      const type = String(body.type) as "waiter" | "bill";
      if (!["waiter", "bill"].includes(type)) throw new Error("คำขอบริการไม่ถูกต้อง");
      if (type === "bill") {
        if (!order) throw new Error("โต๊ะนี้ยังไม่มีออเดอร์");
        const draft = await db.select({ id: orderItems.id }).from(orderItems).where(and(eq(orderItems.orderId, order.id), eq(orderItems.status, "draft"))).limit(1);
        if (draft.length) throw new Error("กรุณาส่งรายการอาหารเข้าครัวก่อนเรียกคิดเงิน");
      }
      const existing = await db.select({ id: serviceRequests.id }).from(serviceRequests).where(and(eq(serviceRequests.tableId, table.id), eq(serviceRequests.type, type), inArray(serviceRequests.status, ["open", "acknowledged"]))).limit(1);
      if (existing.length) return NextResponse.json({ ok: true, duplicate: true });
      await db.insert(serviceRequests).values({ id: id("service"), tableId: table.id, orderId: order?.id ?? null, type, status: "open", createdAt: now });
      await log(table.id, type === "bill" ? "REQUEST_BILL" : "CALL_WAITER", `โต๊ะ ${table.number}`);
      return NextResponse.json({ ok: true });
    }

    throw new Error("คำสั่งไม่ถูกต้อง");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ" }, { status: 400 });
  }
}
