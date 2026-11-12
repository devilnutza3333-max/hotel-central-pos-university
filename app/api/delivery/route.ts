import { and, asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../db";
import { appSettings, deliveryOrderItems, deliveryOrders, menuImages, menuItems, users } from "../../../db/schema";

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function text(value: unknown, label: string, min: number, max: number) {
  const result = String(value ?? "").trim();
  if (result.length < min || result.length > max) throw new Error(`${label}ไม่ถูกต้อง`);
  return result;
}

export async function GET(request: Request) {
  const db = getDb();
  const trackingToken = new URL(request.url).searchParams.get("track")?.trim() ?? "";
  if (trackingToken) {
    if (!/^[a-f0-9]{32,64}$/i.test(trackingToken)) return NextResponse.json({ error: "ลิงก์ติดตามไม่ถูกต้อง" }, { status: 400 });
    const [order] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.trackingToken, trackingToken)).limit(1);
    if (!order) return NextResponse.json({ error: "ไม่พบออเดอร์สำหรับลิงก์นี้" }, { status: 404 });
    const [items, rider] = await Promise.all([
      db.select().from(deliveryOrderItems).where(eq(deliveryOrderItems.orderId, order.id)),
      order.riderId ? db.select({ name: users.name }).from(users).where(eq(users.id, order.riderId)).limit(1) : Promise.resolve([]),
    ]);
    return NextResponse.json({
      tracking: {
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        building: order.building,
        deliveryPoint: order.deliveryPoint,
        note: order.note,
        status: order.status,
        total: order.total,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        confirmedAt: order.confirmedAt,
        pickedUpAt: order.pickedUpAt,
        nearArrivalAt: order.nearArrivalAt,
        deliveredAt: order.deliveredAt,
        riderName: rider[0]?.name ?? null,
        items,
      },
    }, { headers: { "cache-control": "no-store" } });
  }
  const [menus, images, settings] = await Promise.all([
    db.select().from(menuItems).where(and(eq(menuItems.active, true), eq(menuItems.available, true))).orderBy(asc(menuItems.category), asc(menuItems.name)),
    db.select({ menuItemId: menuImages.menuItemId, updatedAt: menuImages.updatedAt }).from(menuImages),
    db.select().from(appSettings).where(eq(appSettings.key, "line_group_url")).limit(1),
  ]);
  const imageVersion = new Map(images.map((image) => [image.menuItemId, image.updatedAt.getTime()]));
  return NextResponse.json({
    menu: menus.map((menu) => ({ ...menu, imageUrl: imageVersion.has(menu.id) ? `/api/menu-image?id=${menu.id}&v=${imageVersion.get(menu.id)}` : null })),
    lineGroupUrl: settings[0]?.value ?? "",
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const customerName = text(body.customerName, "ชื่อผู้สั่ง", 2, 80);
    const phone = String(body.phone ?? "").replace(/[^0-9]/g, "");
    if (!/^0[0-9]{8,9}$/.test(phone)) throw new Error("กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง");
    const building = text(body.building, "อาคาร/ตึก", 2, 120);
    const deliveryPoint = text(body.deliveryPoint, "ห้องหรือจุดรับอาหาร", 2, 160);
    const note = String(body.note ?? "").trim().slice(0, 300);
    if (body.campusConfirmed !== true) throw new Error("กรุณายืนยันว่าจุดรับอยู่ภายในมหาวิทยาลัยราชภัฏเพชรบุรี");
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!rawItems.length || rawItems.length > 30) throw new Error("กรุณาเลือกเมนูอาหาร");

    const quantities = new Map<number, number>();
    for (const raw of rawItems) {
      const row = raw as Record<string, unknown>;
      const menuItemId = Number(row.menuItemId);
      const quantity = Number(row.quantity);
      if (!Number.isInteger(menuItemId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error("จำนวนสินค้าไม่ถูกต้อง");
      quantities.set(menuItemId, Math.min(20, (quantities.get(menuItemId) ?? 0) + quantity));
    }

    const db = getDb();
    const openOrders = await db.select({ id: deliveryOrders.id }).from(deliveryOrders).where(and(eq(deliveryOrders.phone, phone), inArray(deliveryOrders.status, ["pending", "confirmed", "preparing", "out_for_delivery", "near_arrival"])));
    if (openOrders.length >= 3) throw new Error("เบอร์นี้มีออเดอร์ที่กำลังดำเนินการครบ 3 รายการแล้ว กรุณาติดต่อร้าน");
    const menuIds = Array.from(quantities.keys());
    const availableMenus = await db.select().from(menuItems).where(and(inArray(menuItems.id, menuIds), eq(menuItems.active, true), eq(menuItems.available, true)));
    if (availableMenus.length !== menuIds.length) throw new Error("มีเมนูบางรายการปิดขายหรือหมดชั่วคราว กรุณาโหลดหน้าใหม่");
    const subtotal = availableMenus.reduce((sum, menu) => sum + menu.price * (quantities.get(menu.id) ?? 0), 0);
    const now = new Date();
    const orderId = id("delivery");
    const trackingToken = crypto.randomUUID().replaceAll("-", "");
    const orderNumber = `DLV-${Date.now().toString().slice(-8)}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    await db.insert(deliveryOrders).values({ id: orderId, orderNumber, trackingToken, customerName, phone, building, deliveryPoint, note, campusConfirmed: true, subtotal, total: subtotal, status: "pending", createdAt: now, updatedAt: now });
    await db.insert(deliveryOrderItems).values(availableMenus.map((menu) => ({ id: id("delivery_item"), orderId, menuItemId: menu.id, name: menu.name, unitPrice: menu.price, quantity: quantities.get(menu.id) ?? 1 })));
    return NextResponse.json({ ok: true, orderNumber, total: subtotal, trackingToken });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ส่งออเดอร์ไม่สำเร็จ" }, { status: 400 });
  }
}
