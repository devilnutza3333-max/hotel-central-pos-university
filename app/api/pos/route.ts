import { NextResponse } from "next/server";
import { and, asc, desc, eq, inArray, isNull, lt, ne } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { createPasswordHash, normalizeUsername, validPassword, validUsername, verifyPassword } from "../../local-auth";
import { getDb } from "../../../db";
import {
  appSettings,
  actionRequests,
  authAccounts,
  authSessions,
  auditLogs,
  cashMovements,
  cashShifts,
  diningTables,
  deliveryOrderItems,
  deliveryOrders,
  dutyAssignments,
  dutyShifts,
  guestVisits,
  inventoryItems,
  menuImages,
  menuItems,
  menuRecipes,
  orderItems,
  orderPayments,
  orders,
  openingClosingRuns,
  printJobs,
  printQueueJobs,
  readinessRuns,
  serviceRequests,
  stockMovements,
  stockCountLines,
  stockCountSessions,
  stockReceiptItems,
  stockReceipts,
  users,
} from "../../../db/schema";
import { queueKitchenPrintBatch } from "../../print-queue-server";

const managementRoles = new Set(["instructor", "manager"]);
const paymentRoles = new Set(["instructor", "manager", "cashier"]);
const activeOrderStatuses = ["open", "sent", "preparing", "ready", "served"] as const;
const dutyStationValues = ["host", "service", "kitchen", "bar", "cashier_trainee", "delivery"] as const;
type DutyStation = typeof dutyStationValues[number];

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function requiredText(value: unknown, label: string, maxLength = 120) {
  const text = String(value ?? "").trim();
  if (!text || text.length > maxLength) throw new Error(`${label}ไม่ถูกต้อง`);
  return text;
}

function positiveNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label}ต้องมากกว่า 0`);
  return number;
}

function toMilliUnits(value: unknown, label: string, allowNegative = false) {
  const number = Number(value);
  if (!Number.isFinite(number) || (!allowNegative && number <= 0) || (allowNegative && number === 0)) {
    throw new Error(`${label}ไม่ถูกต้อง`);
  }
  return Math.round(number * 1000);
}

function toNonNegativeMilliUnits(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label}ต้องเป็นศูนย์หรือมากกว่า`);
  return Math.round(number * 1000);
}

function parseImage(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const match = String(value).match(/^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("รองรับเฉพาะรูป WebP, JPEG หรือ PNG");
  if (match[2].length > 480_000) throw new Error("รูปมีขนาดใหญ่เกินไป กรุณาเลือกรูปใหม่");
  return { mimeType: match[1], base64Data: match[2] };
}

async function saveMenuImage(menuItemId: number, imageValue: unknown, now: Date) {
  const image = parseImage(imageValue);
  if (image === undefined) return;
  const db = getDb();
  if (image === null) {
    await db.delete(menuImages).where(eq(menuImages.menuItemId, menuItemId));
    return;
  }
  await db.insert(menuImages).values({ menuItemId, ...image, updatedAt: now }).onConflictDoUpdate({
    target: menuImages.menuItemId,
    set: { ...image, updatedAt: now },
  });
}

async function bootstrap() {
  const db = getDb();
  const firstTable = await db.select().from(diningTables).limit(1);
  if (!firstTable.length) {
    const initialTables = Array.from({ length: 40 }, (_, index) => ({
        id: index + 1,
        number: index + 1,
        zone: index < 20 ? "ห้องอาหาร" : index < 30 ? "ระเบียง" : "ห้องจัดเลี้ยง",
        seats: index >= 30 ? 8 : 4,
        status: "available" as const,
      }));
    // Cloudflare D1 limits the number of bound SQL variables per statement.
    // Ten tables per insert stays safely below that limit and remains idempotent.
    for (let start = 0; start < initialTables.length; start += 10) {
      await db
        .insert(diningTables)
        .values(initialTables.slice(start, start + 10))
        .onConflictDoNothing();
    }
  }

  const firstMenu = await db.select().from(menuItems).limit(1);
  if (!firstMenu.length) {
    await db.insert(menuItems).values([
      { id: 1, name: "ข้าวผัดโรงแรม", category: "อาหารจานเดียว", price: 9500 },
      { id: 2, name: "ผัดไทยกุ้งสด", category: "อาหารจานเดียว", price: 12000 },
      { id: 3, name: "กะเพราเนื้อไข่ดาว", category: "อาหารจานเดียว", price: 13500 },
      { id: 4, name: "ต้มยำกุ้ง", category: "กับข้าว", price: 22000 },
      { id: 5, name: "แกงเขียวหวานไก่", category: "กับข้าว", price: 18000 },
      { id: 6, name: "ปลากะพงทอดน้ำปลา", category: "กับข้าว", price: 39000 },
      { id: 7, name: "ซีซาร์สลัด", category: "สลัด", price: 16000 },
      { id: 8, name: "คลับแซนด์วิช", category: "อาหารตะวันตก", price: 18000 },
      { id: 9, name: "สปาเกตตีคาโบนารา", category: "อาหารตะวันตก", price: 21000 },
      { id: 10, name: "น้ำเปล่า", category: "เครื่องดื่ม", price: 3000 },
      { id: 11, name: "น้ำอัดลม", category: "เครื่องดื่ม", price: 4500 },
      { id: 12, name: "กาแฟเย็น", category: "เครื่องดื่ม", price: 7500 },
    ]).onConflictDoNothing();
  }
  const tablesWithoutToken = await db.select({ id: diningTables.id }).from(diningTables).where(isNull(diningTables.publicToken));
  for (const table of tablesWithoutToken) {
    await db.update(diningTables).set({ publicToken: crypto.randomUUID().replaceAll("-", "") }).where(eq(diningTables.id, table.id));
  }
}

let bootstrapPromise: Promise<void> | null = null;

function ensureBootstrap() {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrap().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }
  return bootstrapPromise;
}

async function currentProfile(authInput?: Awaited<ReturnType<typeof getChatGPTUser>>) {
  const auth = authInput ?? await getChatGPTUser();
  if (!auth) return null;
  const db = getDb();
  const now = new Date();
  let [profile] = await db.select().from(users).where(eq(users.id, auth.userId)).limit(1);
  if (!profile) {
    const existing = await db.select().from(users).limit(1);
    const role = existing.length ? "student" : "instructor";
    await db.insert(users).values({
      id: auth.userId,
      email: auth.email,
      name: auth.displayName,
      role,
      active: true,
      lastSeenAt: now,
      createdAt: now,
    });
    [profile] = await db.select().from(users).where(eq(users.id, auth.userId)).limit(1);
  } else if (now.getTime() - profile.lastSeenAt.getTime() > 60_000) {
    await db.update(users).set({ name: auth.displayName, email: auth.email, lastSeenAt: now }).where(eq(users.id, auth.userId));
    profile = { ...profile, name: auth.displayName, email: auth.email, lastSeenAt: now };
  }
  return profile;
}

async function log(actorId: string, action: string, detail: string) {
  await getDb().insert(auditLogs).values({ id: id("log"), actorId, action, detail, createdAt: new Date() });
}

function productionDepartment(category: string) {
  const normalized = category.toLowerCase();
  if (["เครื่องดื่ม", "กาแฟ", "ชา", "น้ำ", "drink", "coffee", "beverage"].some((word) => normalized.includes(word))) return "บาร์เครื่องดื่ม";
  if (["ของหวาน", "เบเกอรี่", "เค้ก", "dessert", "bakery"].some((word) => normalized.includes(word))) return "ของหวาน";
  return "ครัวร้อน";
}

async function loadDepartmentItems(orderId: string) {
  const db = getDb();
  const rows = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const menuIds = Array.from(new Set(rows.map((row) => row.menuItemId)));
  const [menus, settings] = await Promise.all([
    menuIds.length ? db.select({ id: menuItems.id, category: menuItems.category }).from(menuItems).where(inArray(menuItems.id, menuIds)) : Promise.resolve([]),
    db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, "printer_category_departments")).limit(1),
  ]);
  let mappings: Record<string, string> = {};
  try {
    const parsed = JSON.parse(settings[0]?.value ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) mappings = parsed as Record<string, string>;
  } catch {
    mappings = {};
  }
  const categoryByMenuId = new Map(menus.map((menu) => [menu.id, menu.category]));
  return rows.map((row) => {
    const category = categoryByMenuId.get(row.menuItemId) ?? "อาหาร";
    return { ...row, department: mappings[category] || productionDepartment(category) };
  });
}

async function loadDutyAccess(userId: string) {
  const db = getDb();
  const [shift] = await db.select().from(dutyShifts).where(eq(dutyShifts.status, "open")).orderBy(desc(dutyShifts.openedAt)).limit(1);
  if (!shift) return { shift: null, assignments: [], stations: new Set<DutyStation>() };
  const assignments = await db.select().from(dutyAssignments).where(and(eq(dutyAssignments.dutyShiftId, shift.id), eq(dutyAssignments.userId, userId)));
  return {
    shift,
    assignments,
    stations: new Set(assignments.filter((assignment) => assignment.status === "checked_in").map((assignment) => assignment.station as DutyStation)),
  };
}

async function requireManagerApproval(usernameValue: unknown, passwordValue: unknown) {
  const username = normalizeUsername(String(usernameValue ?? ""));
  const password = String(passwordValue ?? "");
  const db = getDb();
  const [account] = await db.select().from(authAccounts).where(eq(authAccounts.username, username)).limit(1);
  if (!account || (account.lockedUntil && account.lockedUntil > new Date())) throw new Error("ชื่อผู้ใช้หรือรหัสอนุมัติผู้จัดการไม่ถูกต้อง");
  const [approver] = await db.select().from(users).where(eq(users.id, account.userId)).limit(1);
  if (!approver?.active || !managementRoles.has(approver.role)) throw new Error("บัญชีนี้ไม่มีสิทธิ์อนุมัติรายการการเงิน");
  const valid = await verifyPassword(password, account.passwordSalt, account.passwordIterations, account.passwordHash);
  if (!valid) throw new Error("ชื่อผู้ใช้หรือรหัสอนุมัติผู้จัดการไม่ถูกต้อง");
  return approver;
}

function calculateAmounts(rows: Array<{ unitPrice: number; optionPrice: number; quantity: number }>, pricing: {
  discountType: "none" | "percent" | "amount";
  discountValue: number;
  serviceChargeRate: number;
  vatRate: number;
}) {
  const subtotal = rows.reduce((sum, row) => sum + (row.unitPrice + row.optionPrice) * row.quantity, 0);
  const discountAmount = pricing.discountType === "percent"
    ? Math.min(subtotal, Math.round(subtotal * pricing.discountValue / 10_000))
    : pricing.discountType === "amount" ? Math.min(subtotal, pricing.discountValue) : 0;
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const serviceChargeAmount = Math.round(afterDiscount * pricing.serviceChargeRate / 10_000);
  const vatAmount = Math.round((afterDiscount + serviceChargeAmount) * pricing.vatRate / 10_000);
  return { subtotal, discountAmount, serviceChargeAmount, vatAmount, total: afterDiscount + serviceChargeAmount + vatAmount };
}

async function recalculateOrder(orderId: string, now: Date, override: Partial<{
  discountType: "none" | "percent" | "amount";
  discountValue: number;
  serviceChargeRate: number;
  vatRate: number;
}> = {}) {
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new Error("ไม่พบออเดอร์");
  const rows = await db.select().from(orderItems).where(and(eq(orderItems.orderId, orderId), ne(orderItems.status, "void")));
  const pricing = {
    discountType: override.discountType ?? order.discountType,
    discountValue: override.discountValue ?? order.discountValue,
    serviceChargeRate: override.serviceChargeRate ?? order.serviceChargeRate,
    vatRate: override.vatRate ?? order.vatRate,
  };
  const amounts = calculateAmounts(rows, pricing);
  await db.update(orders).set({ ...pricing, ...amounts, updatedAt: now }).where(eq(orders.id, orderId));
  return { ...pricing, ...amounts };
}

function parseRate(value: unknown, label: string) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0 || number > 30) throw new Error(`${label}ต้องอยู่ระหว่าง 0–30%`);
  return Math.round(number * 100);
}

function receiptNumber(now: Date) {
  const digits = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    .format(now).replace(/\D/g, "");
  return `RC${digits}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
}

function bangkokServiceDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

export async function GET(request: Request) {
  const auth = await getChatGPTUser();
  if (!auth) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  await ensureBootstrap();
  const profile = await currentProfile(auth);
  if (!profile?.active) return NextResponse.json({ error: "บัญชีนี้ถูกระงับ" }, { status: 403 });
  const db = getDb();
  const management = managementRoles.has(profile.role);
  const scope = new URL(request.url).searchParams.get("scope") ?? "tables";
  // Operational screens only need open orders. Keep closed history for reports.
  // Excluding paid/refunded rows prevents materializing older orders and items
  // every 12 seconds on the most frequently polled views.
  const includeClosedOrderHistory = ["finance", "dashboard", "audit", "operations", "readiness"].includes(scope);
  const orderFilter = includeClosedOrderHistory
    ? ne(orders.status, "void")
    : inArray(orders.status, [...activeOrderStatuses]);
  const dutyAccess = await loadDutyAccess(profile.id);
  const dutyStations = dutyAccess.stations;
  const finance = paymentRoles.has(profile.role) || dutyStations.has("cashier_trainee");
  const hostAccess = management || dutyStations.has("host");
  const productionAccess = management || (scope === "kitchen" ? dutyStations.has("kitchen") : scope === "bar" ? dutyStations.has("bar") : false);
  const deliveryAccess = management || dutyStations.has("delivery");
  const needsMenuAdmin = management && ["menu", "costing"].includes(scope);
  const needsOperations = management && scope === "operations";
  const needsInventory = management && ["menu", "costing", "inventory", "stock_count", "operations"].includes(scope);
  const needsUsers = management && ["team", "dashboard", "audit", "duty", "readiness", "stock_count"].includes(scope);
  const needsHost = hostAccess && scope === "host";
  const needsReadiness = management && scope === "readiness";
  const needsStockCount = management && scope === "stock_count";
  const needsAudit = management && ["dashboard", "audit", "readiness", "operations"].includes(scope);
  const needsFinance = finance && ["finance", "operations"].includes(scope);
  const productionScope = productionAccess && ["kitchen", "bar"].includes(scope);
  const needsPrint = productionScope || (finance && scope === "finance") || needsOperations;
  const needsDeliveryItems = deliveryAccess && scope === "delivery";
  if (productionScope) {
    const staleJobs = await db.select().from(printQueueJobs).where(and(eq(printQueueJobs.status, "processing"), lt(printQueueJobs.updatedAt, new Date(Date.now() - 120_000)))).limit(20);
    for (const job of staleJobs) {
      await db.update(printQueueJobs).set({
        status: job.attempts >= 3 ? "failed" : "pending",
        handledBy: job.attempts >= 3 ? job.handledBy : null,
        lastError: "เครื่องพิมพ์ไม่ตอบกลับ ระบบกู้คืนคิวอัตโนมัติ",
        updatedAt: new Date(),
      }).where(eq(printQueueJobs.id, job.id));
    }
  }
  const [tableRows, menuRows, menuAdminRows, imageRows, rawUserRows, accountRows, orderRows, logRows, inventoryRows, recipeRows, movementRows, receiptRows, receiptItemRows, stockCountSessionRows, stockCountLineRows, deliveryRows, deliveryItemRows, settingRows, serviceRows, guestVisitRows, readinessRunRows, openingClosingRunRows, shiftRows, cashMovementRows, paymentRows, printJobRows, printQueueRows] = await Promise.all([
    db.select().from(diningTables).orderBy(asc(diningTables.number)),
    db.select().from(menuItems).where(eq(menuItems.active, true)).orderBy(asc(menuItems.category), asc(menuItems.name)),
    needsMenuAdmin ? db.select().from(menuItems).orderBy(asc(menuItems.category), asc(menuItems.name)) : Promise.resolve([]),
    db.select({ menuItemId: menuImages.menuItemId, updatedAt: menuImages.updatedAt }).from(menuImages),
    needsUsers || needsFinance || needsPrint ? db.select().from(users).orderBy(desc(users.lastSeenAt)) : Promise.resolve([]),
    needsUsers ? db.select({ userId: authAccounts.userId, username: authAccounts.username }).from(authAccounts) : Promise.resolve([]),
    db.select().from(orders).where(orderFilter).orderBy(desc(orders.updatedAt)).limit(scope === "finance" ? 1000 : 100),
    needsAudit ? db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(scope === "audit" ? 500 : scope === "readiness" ? 150 : 30) : Promise.resolve([]),
    needsInventory ? db.select().from(inventoryItems).orderBy(asc(inventoryItems.name)) : Promise.resolve([]),
    needsMenuAdmin ? db.select().from(menuRecipes) : Promise.resolve([]),
    management && scope === "inventory" ? db.select().from(stockMovements).orderBy(desc(stockMovements.createdAt)).limit(80) : Promise.resolve([]),
    needsInventory ? db.select().from(stockReceipts).orderBy(desc(stockReceipts.receivedAt)).limit(500) : Promise.resolve([]),
    needsInventory ? db.select().from(stockReceiptItems).where(inArray(
      stockReceiptItems.receiptId,
      db.select({ id: stockReceipts.id }).from(stockReceipts).orderBy(desc(stockReceipts.receivedAt)).limit(500),
    )) : Promise.resolve([]),
    needsStockCount ? db.select().from(stockCountSessions).orderBy(desc(stockCountSessions.serviceDate)).limit(60) : Promise.resolve([]),
    needsStockCount ? db.select().from(stockCountLines).where(inArray(
      stockCountLines.sessionId,
      db.select({ id: stockCountSessions.id }).from(stockCountSessions).orderBy(desc(stockCountSessions.serviceDate)).limit(60),
    )) : Promise.resolve([]),
    deliveryAccess
      ? db.select().from(deliveryOrders).orderBy(desc(deliveryOrders.createdAt)).limit(100)
      : Promise.resolve([]),
    needsDeliveryItems ? db.select().from(deliveryOrderItems) : Promise.resolve([]),
    db.select().from(appSettings),
    db.select().from(serviceRequests).orderBy(desc(serviceRequests.createdAt)).limit(100),
    needsHost ? db.select().from(guestVisits).orderBy(desc(guestVisits.updatedAt)).limit(300) : Promise.resolve([]),
    needsReadiness ? db.select().from(readinessRuns).orderBy(desc(readinessRuns.createdAt)).limit(30) : Promise.resolve([]),
    needsOperations ? db.select().from(openingClosingRuns).orderBy(desc(openingClosingRuns.approvedAt)).limit(60) : Promise.resolve([]),
    needsFinance ? db.select().from(cashShifts).orderBy(desc(cashShifts.openedAt)).limit(30) : Promise.resolve([]),
    needsFinance ? db.select().from(cashMovements).orderBy(desc(cashMovements.createdAt)).limit(1000) : Promise.resolve([]),
    needsFinance ? db.select().from(orderPayments).orderBy(desc(orderPayments.createdAt)).limit(2000) : Promise.resolve([]),
    needsPrint ? db.select().from(printJobs).orderBy(desc(printJobs.printedAt)).limit(500) : Promise.resolve([]),
    productionScope || needsOperations ? db.select().from(printQueueJobs).orderBy(desc(printQueueJobs.createdAt)).limit(200) : Promise.resolve([]),
  ]);
  // Keep snapshot item rows aligned with the order window returned above.
  // Previously every refresh loaded ALL non-void order_items (unbounded),
  // growing CPU spent materializing and JSON-serializing historical sales.
  // SQL subquery avoids passing a potentially long list of IDs through JS.
  // No write, migration, or change to existing order/payment records.
  const itemRows = orderRows.length
    ? await db.select().from(orderItems).where(and(
        ne(orderItems.status, "void"),
        inArray(orderItems.orderId,
          db.select({ id: orders.id }).from(orders)
            .where(orderFilter)
            .orderBy(desc(orders.updatedAt))
            .limit(scope === "finance" ? 1000 : 100),
        ),
      ))
    : [];
  const imageVersion = new Map(imageRows.map((image) => [image.menuItemId, image.updatedAt.getTime()]));
  const withImage = <T extends { id: number }>(row: T) => ({
    ...row,
    imageUrl: imageVersion.has(row.id) ? `/api/menu-image?id=${row.id}&v=${imageVersion.get(row.id)}` : null,
  });
  const usernameByUserId = new Map(accountRows.map((account) => [account.userId, account.username]));
  const userRows = rawUserRows.map((user) => ({ ...user, username: usernameByUserId.get(user.id) ?? user.email }));
  const userById = new Map(rawUserRows.map((user) => [user.id, user]));
  const receiptDateById = new Map(receiptRows.map((receipt) => [receipt.id, receipt.receivedAt]));
  const latestUnitCostByInventoryId = new Map<string, { inventoryItemId: string; unitCost: number; receivedAt: Date }>();
  for (const line of receiptItemRows) {
    const receivedAt = receiptDateById.get(line.receiptId);
    if (!receivedAt) continue;
    const current = latestUnitCostByInventoryId.get(line.inventoryItemId);
    if (!current || receivedAt.getTime() > current.receivedAt.getTime()) latestUnitCostByInventoryId.set(line.inventoryItemId, { inventoryItemId: line.inventoryItemId, unitCost: line.unitCost, receivedAt });
  }
  const enrichedLogs = logRows.map((entry) => ({
    ...entry,
    actorName: userById.get(entry.actorId)?.name ?? "บัญชีระบบ",
    actorRole: userById.get(entry.actorId)?.role ?? "system",
  }));
  const riderIds = Array.from(new Set(deliveryRows.map((order) => order.riderId).filter((value): value is string => Boolean(value))));
  const riderRows = riderIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, riderIds)) : [];
  const riderNameById = new Map(riderRows.map((rider) => [rider.id, rider.name]));
  const dutyShiftRows = management && ["duty", "operations"].includes(scope)
    ? await db.select().from(dutyShifts).orderBy(desc(dutyShifts.openedAt)).limit(20)
    : dutyAccess.shift ? [dutyAccess.shift] : [];
  const dutyAssignmentRows = management && ["duty", "operations"].includes(scope)
    ? await db.select().from(dutyAssignments).orderBy(desc(dutyAssignments.assignedAt)).limit(500)
    : dutyAccess.assignments;
  let categoryDepartments: Record<string, string> = {};
  try {
    const parsed = JSON.parse(settingRows.find((row) => row.key === "printer_category_departments")?.value ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) categoryDepartments = parsed as Record<string, string>;
  } catch {
    categoryDepartments = {};
  }
  return NextResponse.json({
    profile,
    dutyStations: Array.from(dutyStations),
    dutyShifts: dutyShiftRows,
    dutyAssignments: dutyAssignmentRows.map((assignment) => ({
      ...assignment,
      userName: userById.get(assignment.userId)?.name ?? (assignment.userId === profile.id ? profile.name : "ผู้ใช้งาน"),
      username: usernameByUserId.get(assignment.userId) ?? (assignment.userId === profile.id ? profile.email : ""),
    })),
    tables: tableRows.map((table) => management ? table : { id: table.id, number: table.number, zone: table.zone, seats: table.seats, status: table.status }),
    menu: menuRows.map(withImage),
    ...(needsMenuAdmin ? { menuAdmin: menuAdminRows.map(withImage), recipes: recipeRows } : {}),
    ...(needsUsers ? { users: userRows } : {}),
    orders: orderRows,
    items: itemRows,
    ...(needsAudit ? { logs: enrichedLogs } : {}),
    ...(needsInventory ? { inventory: inventoryRows, latestUnitCosts: Array.from(latestUnitCostByInventoryId.values()) } : {}),
    ...(needsStockCount ? {
      stockCountSessions: stockCountSessionRows.map((session) => ({
        ...session,
        createdByName: userById.get(session.createdBy)?.name ?? "ผู้ตรวจนับ",
        submittedByName: session.submittedBy ? userById.get(session.submittedBy)?.name ?? "ผู้ส่งตรวจ" : null,
        approvedByName: session.approvedBy ? userById.get(session.approvedBy)?.name ?? "ผู้อนุมัติ" : null,
      })),
      stockCountLines: stockCountLineRows.map((line) => ({
        ...line,
        countedByName: line.countedBy ? userById.get(line.countedBy)?.name ?? "ผู้ตรวจนับ" : null,
      })),
    } : {}),
    ...(management && scope === "inventory" ? { movements: movementRows, receipts: receiptRows } : {}),
    deliveryOrders: deliveryRows.map((order) => ({ ...order, riderName: order.riderId ? riderNameById.get(order.riderId) ?? "ผู้ส่งอาหาร" : null })),
    ...(needsDeliveryItems ? { deliveryItems: deliveryItemRows } : {}),
    deliveryLineGroupUrl: settingRows.find((row) => row.key === "line_group_url")?.value ?? "",
    billingSettings: {
      vatRate: Number(settingRows.find((row) => row.key === "vat_rate")?.value ?? 0),
      serviceChargeRate: Number(settingRows.find((row) => row.key === "service_charge_rate")?.value ?? 0),
      promptPayId: settingRows.find((row) => row.key === "promptpay_id")?.value ?? "",
      promptPayName: settingRows.find((row) => row.key === "promptpay_name")?.value ?? "",
    },
    printerSettings: {
      paperWidth: Number(settingRows.find((row) => row.key === "printer_paper_width")?.value ?? 80) === 58 ? 58 : 80,
      categoryDepartments,
    },
    ...(needsPrint ? {
      printJobs: printJobRows.map((job) => ({
        ...job,
        printedByName: userById.get(job.printedBy)?.name ?? "ผู้ใช้งาน",
      })),
      printQueueJobs: printQueueRows.map((job) => ({
        ...job,
        itemIds: (() => { try { return JSON.parse(job.itemIds) as string[]; } catch { return []; } })(),
        handledByName: job.handledBy ? userById.get(job.handledBy)?.name ?? "เครื่องครัว" : null,
      })),
    } : {}),
    ...(needsFinance ? {
      shifts: shiftRows,
      cashMovements: cashMovementRows,
      payments: paymentRows.map((payment) => ({
        ...payment,
        receivedByName: userById.get(payment.receivedBy)?.name ?? "ผู้รับชำระ",
        reversedByName: payment.reversedBy ? userById.get(payment.reversedBy)?.name ?? "ผู้อนุมัติ" : null,
      })),
    } : {}),
    serviceRequests: serviceRows,
    guestVisits: guestVisitRows,
    readinessRuns: readinessRunRows.map((run) => ({
      ...run,
      actorName: userById.get(run.actorId)?.name ?? "ผู้ควบคุมระบบ",
      checks: (() => { try { return JSON.parse(run.results) as unknown[]; } catch { return []; } })(),
    })),
    openingClosingRuns: openingClosingRunRows.map((run) => ({
      ...run,
      approvedByName: userById.get(run.approvedBy)?.name ?? "ผู้ควบคุมระบบ",
      checks: (() => { try { return JSON.parse(run.checks) as unknown[]; } catch { return []; } })(),
    })),
    serverTime: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await getChatGPTUser();
  if (!auth) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  await ensureBootstrap();
  const profile = await currentProfile(auth);
  if (!profile?.active) return NextResponse.json({ error: "บัญชีนี้ถูกระงับ" }, { status: 403 });
  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const db = getDb();
  const now = new Date();
  const clientRequestId = String(body.clientRequestId ?? "");

  try {
    if (/^[a-f0-9-]{20,64}$/i.test(clientRequestId)) {
      const [duplicate] = await db.select({ id: actionRequests.id }).from(actionRequests).where(eq(actionRequests.id, clientRequestId)).limit(1);
      if (duplicate) return NextResponse.json({ ok: true, duplicate: true });
      await db.insert(actionRequests).values({ id: clientRequestId, actorId: profile.id, action, createdAt: now });
    }

    const dutyAccess = await loadDutyAccess(profile.id);
    const dutyStations = dutyAccess.stations;
    const isManagement = managementRoles.has(profile.role);
    const canHandleHost = isManagement || dutyStations.has("host");
    const canOperateTables = isManagement || profile.role === "cashier" || dutyStations.has("host") || dutyStations.has("service") || dutyStations.has("cashier_trainee");
    const canHandleService = isManagement || dutyStations.has("host") || dutyStations.has("service");
    const canHandleKitchen = isManagement || dutyStations.has("kitchen");
    const canHandleBar = isManagement || dutyStations.has("bar");
    const canHandleDelivery = isManagement || dutyStations.has("delivery");
    const canReceivePayment = paymentRoles.has(profile.role) || dutyStations.has("cashier_trainee");

    if (action === "runReadinessCheck") {
      if (!isManagement) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      const [tableRows, allOrders, allItems, allPayments, queueRows, activeMenus, visitRows, serviceRows, auditRows, stockRows, recipeRows, requestRows, legacyCutoffRows] = await Promise.all([
        db.select().from(diningTables),
        db.select().from(orders).where(ne(orders.status, "void")),
        db.select().from(orderItems).where(ne(orderItems.status, "void")),
        db.select().from(orderPayments).where(eq(orderPayments.status, "confirmed")),
        db.select().from(printQueueJobs).where(inArray(printQueueJobs.status, ["pending", "processing", "failed"])),
        db.select().from(menuItems).where(and(eq(menuItems.active, true), eq(menuItems.available, true))),
        db.select().from(guestVisits).where(inArray(guestVisits.status, ["reserved", "waiting", "seated"])),
        db.select().from(serviceRequests).where(ne(serviceRequests.status, "resolved")),
        db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200),
        db.select().from(inventoryItems).where(eq(inventoryItems.active, true)),
        db.select().from(menuRecipes),
        db.select().from(actionRequests).orderBy(desc(actionRequests.createdAt)).limit(1),
        db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, "readiness_legacy_cutoff")).limit(1),
      ]);
      const legacyCutoff = new Date(legacyCutoffRows[0]?.value ?? 0);
      const legacyCutoffMs = Number.isNaN(legacyCutoff.getTime()) ? 0 : legacyCutoff.getTime();
      const activeOrders = allOrders.filter((order) => (activeOrderStatuses as readonly string[]).includes(order.status));
      const checks: Array<{ id: string; category: string; label: string; status: "pass" | "warning" | "fail"; detail: string }> = [];
      const add = (idValue: string, category: string, label: string, status: "pass" | "warning" | "fail", detail: string) => checks.push({ id: idValue, category, label, status, detail });
      add("guest", "1 • รับลูกค้า", "จอต้อนรับ คิว และโต๊ะ", tableRows.length >= 40 && activeMenus.length > 0 ? "pass" : "fail", `พบ ${tableRows.length} โต๊ะ • เมนูพร้อมขาย ${activeMenus.length} รายการ • จอง/คิว/นั่งแล้ว ${visitRows.length} รายการ`);
      const activeByTable = new Map<number, number>();
      for (const order of activeOrders) activeByTable.set(order.tableId, (activeByTable.get(order.tableId) ?? 0) + 1);
      const duplicateTables = Array.from(activeByTable.entries()).filter(([, count]) => count > 1).map(([tableId]) => tableRows.find((table) => table.id === tableId)?.number ?? tableId);
      const knownOrderIds = new Set(allOrders.map((order) => order.id));
      const orphanItems = allItems.filter((item) => !knownOrderIds.has(item.orderId));
      add("orders", "2 • รับออเดอร์", "ออเดอร์ไม่ซ้ำและรายการไม่ตกหล่น", duplicateTables.length || orphanItems.length ? "fail" : "pass", duplicateTables.length ? `พบหลายออเดอร์เปิดพร้อมกันที่โต๊ะ ${duplicateTables.join(", ")}` : orphanItems.length ? `พบรายการอาหารที่ไม่ผูกกับบิล ${orphanItems.length} รายการ` : `ออเดอร์ที่กำลังทำงาน ${activeOrders.length} รายการ • รายการอาหาร ${allItems.length} รายการ • ไม่พบข้อมูลซ้ำหรือตกหล่น`);
      add("idempotency", "2 • รับออเดอร์", "ป้องกันการกดส่งซ้ำ", "pass", `ระบบใช้รหัสคำขอเฉพาะทุกครั้ง${requestRows.length ? " และตรวจพบประวัติคำขอล่าสุดแล้ว" : " พร้อมเริ่มป้องกันทันทีเมื่อทำรายการ"}`);
      const activeOrderIds = new Set(activeOrders.map((order) => order.id));
      const orderById = new Map(allOrders.map((order) => [order.id, order]));
      const orphanProductionItems = allItems.filter((item) => {
        if (!["sent", "preparing", "ready"].includes(item.status) || activeOrderIds.has(item.orderId)) return false;
        const parent = orderById.get(item.orderId);
        return !parent || parent.updatedAt.getTime() >= legacyCutoffMs;
      });
      const failedQueue = queueRows.filter((job) => job.status === "failed");
      const kitchenMenus = activeMenus.filter((menu) => productionDepartment(menu.category) !== "บาร์เครื่องดื่ม");
      const barMenus = activeMenus.filter((menu) => productionDepartment(menu.category) === "บาร์เครื่องดื่ม");
      add("production", "3 • ครัว / บาร์", "เส้นทางผลิตและคิวงาน", failedQueue.length ? "fail" : orphanProductionItems.length || !barMenus.length ? "warning" : "pass", failedQueue.length ? `มีงานพิมพ์ล้มเหลว ${failedQueue.length} งาน` : orphanProductionItems.length ? `พบรายการผลิตที่ไม่ผูกกับออเดอร์ทำงาน ${orphanProductionItems.length} รายการ` : `ครัว ${kitchenMenus.length} เมนู • บาร์ ${barMenus.length} เมนู • คิวรอดำเนินการ ${queueRows.length} งาน`);
      const seatedOrderIds = new Set(visitRows.filter((visit) => visit.status === "seated" && visit.orderId).map((visit) => visit.orderId));
      const handoverOrderIds = new Set(serviceRows.filter((request) => request.type === "seated" && request.orderId).map((request) => request.orderId));
      const missedHandovers = Array.from(seatedOrderIds).filter((orderId) => !handoverOrderIds.has(orderId));
      add("service", "4 • เสิร์ฟ", "ส่งต่อจากต้อนรับถึงพนักงานเสิร์ฟ", missedHandovers.length ? "warning" : "pass", missedHandovers.length ? `มีลูกค้านั่งแล้วแต่ไม่พบคำแจ้งเสิร์ฟ ${missedHandovers.length} โต๊ะ` : `คำขอบริการที่กำลังดำเนินการ ${serviceRows.length} รายการ • การส่งต่อครบ`);
      const paidOrders = allOrders.filter((order) => order.status === "paid" && (order.closedAt?.getTime() ?? order.updatedAt.getTime()) >= legacyCutoffMs).sort((a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0)).slice(0, 100);
      const paidOrderIds = new Set(allPayments.map((payment) => payment.orderId));
      const unpaidRecords = paidOrders.filter((order) => !paidOrderIds.has(order.id));
      const paymentOrderIds = new Set(allOrders.filter((order) => order.status === "paid").map((order) => order.id));
      const paymentsOnOpenOrders = allPayments.filter((payment) => !paymentOrderIds.has(payment.orderId));
      add("payment", "5 • ชำระเงิน", "บิลและหลักฐานรับชำระ", paymentsOnOpenOrders.length ? "fail" : unpaidRecords.length ? "warning" : "pass", paymentsOnOpenOrders.length ? `พบรายการรับเงินที่บิลยังไม่ปิด ${paymentsOnOpenOrders.length} รายการ` : unpaidRecords.length ? `พบบิลชำระแล้วที่ไม่มีรายการรับเงิน ${unpaidRecords.length} บิล (อาจเป็นข้อมูลรุ่นเก่า)` : `ตรวจบิลล่าสุด ${paidOrders.length} บิล มีหลักฐานรับชำระครบ`);
      const negativeStock = stockRows.filter((stock) => stock.currentStock < 0);
      const lowStock = stockRows.filter((stock) => stock.currentStock >= 0 && stock.currentStock <= stock.minimumStock);
      const menuIdsWithRecipe = new Set(recipeRows.map((recipe) => recipe.menuItemId));
      const menusWithoutRecipe = activeMenus.filter((menu) => !menuIdsWithRecipe.has(menu.id));
      add("stock", "6 • สต๊อก", "ตัดสต๊อกและสูตรอาหาร", negativeStock.length ? "fail" : lowStock.length || menusWithoutRecipe.length ? "warning" : "pass", negativeStock.length ? `พบสต๊อกติดลบ ${negativeStock.length} รายการ` : `วัตถุดิบใกล้ขั้นต่ำ ${lowStock.length} รายการ • เมนูที่ยังไม่มีสูตร ${menusWithoutRecipe.length} รายการ`);
      add("network", "เครือข่าย", "การเชื่อมต่อระบบกลาง", "pass", `API และฐานข้อมูลตอบกลับ ณ ${now.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`);
      const lastBackup = auditRows.find((row) => row.action === "EXPORT_BACKUP");
      const backupAge = lastBackup ? now.getTime() - lastBackup.createdAt.getTime() : Number.POSITIVE_INFINITY;
      add("backup", "การสำรอง", "D1 Time Travel และไฟล์สำรอง", backupAge <= 7 * 86_400_000 ? "pass" : "warning", lastBackup ? `D1 สำรองอัตโนมัติ • ดาวน์โหลดไฟล์ล่าสุด ${lastBackup.createdAt.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}` : "D1 สำรองอัตโนมัติ แต่ยังไม่พบการดาวน์โหลดไฟล์สำรองเก็บภายนอก");
      const recentErrors = auditRows.filter((row) => ["ACTION_FAILED", "AUTO_PRINT_FAILED"].includes(row.action) && now.getTime() - row.createdAt.getTime() <= 86_400_000);
      add("audit", "ตรวจสอบย้อนหลัง", "ข้อผิดพลาดและผู้ดำเนินการ", recentErrors.length >= 3 ? "fail" : recentErrors.length ? "warning" : auditRows.length ? "pass" : "warning", recentErrors.length ? `พบเหตุขัดข้องใน 24 ชั่วโมง ${recentErrors.length} รายการ กรุณาเปิดรายงานด้านล่าง` : auditRows.length ? `มีประวัติผู้ดำเนินการ ${auditRows.length} รายการล่าสุด และไม่พบเหตุขัดข้องใน 24 ชั่วโมง` : "ยังไม่พบประวัติการทำรายการก่อนหน้า");
      const printerStations = ["kitchen", "bar", "receipt"];
      const printerTests = printerStations.map((station) => auditRows.find((row) => row.action === "PRINTER_TEST_PASS" && row.detail.startsWith(`${station} •`) && now.getTime() - row.createdAt.getTime() <= 86_400_000));
      add("printers", "อุปกรณ์", "ทดสอบเครื่องพิมพ์ครัว บาร์ และใบเสร็จ", printerTests.every(Boolean) ? "pass" : "warning", `ทดสอบผ่านใน 24 ชั่วโมง ${printerTests.filter(Boolean).length}/3 จุด • ครัว • บาร์ • ใบเสร็จ`);
      const score = Math.round(checks.reduce((sum, check) => sum + (check.status === "pass" ? 100 : check.status === "warning" ? 65 : 0), 0) / checks.length);
      const status = checks.some((check) => check.status === "fail") ? "fail" : checks.some((check) => check.status === "warning") ? "warning" : "pass";
      const runId = id("ready");
      await db.insert(readinessRuns).values({ id: runId, status, score, results: JSON.stringify(checks), actorId: profile.id, createdAt: now });
      await log(profile.id, "RUN_READINESS_CHECK", `ตรวจความพร้อม ${score}% • ${status} • ผ่าน ${checks.filter((check) => check.status === "pass").length}/${checks.length}`);
      return NextResponse.json({ ok: true, runId, status, score, checks });
    }

    if (action === "recordRecoveryDrill") {
      if (!isManagement) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      const latencyMs = Math.max(0, Math.min(60_000, Math.round(Number(body.latencyMs ?? 0))));
      await log(profile.id, "NETWORK_RECOVERY_TEST", `ทดสอบจำลองเน็ตหลุดและเชื่อมต่อกลับสำเร็จ • ${latencyMs.toLocaleString("th-TH")} ms • ไม่มีข้อมูลจริงถูกแก้ไข`);
      return NextResponse.json({ ok: true });
    }

    if (action === "recordPrinterTest") {
      if (!isManagement) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      const station = String(body.station ?? "");
      if (!(["kitchen", "bar", "receipt"] as string[]).includes(station)) throw new Error("จุดพิมพ์ไม่ถูกต้อง");
      const status = String(body.status ?? "");
      if (!(["pass", "fail"] as string[]).includes(status)) throw new Error("ผลทดสอบไม่ถูกต้อง");
      const paperWidth = Number(body.paperWidth) === 58 ? 58 : 80;
      const detail = String(body.detail ?? "").trim().slice(0, 200);
      await log(profile.id, status === "pass" ? "PRINTER_TEST_PASS" : "PRINTER_TEST_FAIL", `${station} • กระดาษ ${paperWidth} มม.${detail ? ` • ${detail}` : ""}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "repairReadinessLegacyData") {
      if (!isManagement) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      const closedOrders = await db.select({ id: orders.id }).from(orders).where(inArray(orders.status, ["paid", "refunded", "void"]));
      const closedOrderIds = closedOrders.map((order) => order.id);
      let repairedItems = 0;
      if (closedOrderIds.length) {
        const staleItems = await db.select({ id: orderItems.id }).from(orderItems).where(and(inArray(orderItems.orderId, closedOrderIds), inArray(orderItems.status, ["sent", "preparing", "ready"])));
        repairedItems = staleItems.length;
        if (staleItems.length) await db.update(orderItems).set({ status: "served" }).where(inArray(orderItems.id, staleItems.map((item) => item.id)));
      }
      await db.insert(appSettings).values({ key: "readiness_legacy_cutoff", value: now.toISOString(), updatedAt: now, updatedBy: profile.id }).onConflictDoUpdate({
        target: appSettings.key,
        set: { value: now.toISOString(), updatedAt: now, updatedBy: profile.id },
      });
      await log(profile.id, "REPAIR_READINESS_LEGACY", `ปรับสถานะรายการผลิตเก่า ${repairedItems} รายการ • กำหนดจุดเริ่มตรวจหลักฐานการเงินรุ่นใหม่ ${now.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`);
      return NextResponse.json({ ok: true, repairedItems });
    }

    if (action === "completeOpeningChecklist" || action === "completeClosingChecklist") {
      if (!isManagement) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      const runType = action === "completeOpeningChecklist" ? "opening" : "closing";
      const serviceDate = String(body.serviceDate ?? "");
      if (serviceDate !== bangkokServiceDate(now)) throw new Error("อนุมัติได้เฉพาะรายการของวันนี้");
      const requiredKeys = runType === "opening"
        ? ["staff", "kitchen", "bar", "stock", "cash", "printer"]
        : ["sales", "pending", "stock", "backup", "cash", "printer"];
      const rawChecks = Array.isArray(body.checks) ? body.checks : [];
      const checks = requiredKeys.map((key) => {
        const source = rawChecks.find((entry) => entry && typeof entry === "object" && String((entry as Record<string, unknown>).key ?? "") === key) as Record<string, unknown> | undefined;
        return {
          key,
          label: String(source?.label ?? key).trim().slice(0, 120),
          detail: String(source?.detail ?? "").trim().slice(0, 300),
          required: true,
          completed: source?.completed === true,
        };
      });
      if (checks.some((check) => !check.completed)) throw new Error("กรุณาตรวจรายการบังคับให้ครบก่อนอนุมัติ");
      const [existing] = await db.select().from(openingClosingRuns).where(and(eq(openingClosingRuns.serviceDate, serviceDate), eq(openingClosingRuns.runType, runType))).limit(1);
      if (existing) return NextResponse.json({ ok: true, duplicate: true });
      if (runType === "closing") {
        const [opening] = await db.select().from(openingClosingRuns).where(and(eq(openingClosingRuns.serviceDate, serviceDate), eq(openingClosingRuns.runType, "opening"))).limit(1);
        if (!opening) throw new Error("ต้องอนุมัติเปิดร้านก่อนจึงจะปิดร้านได้");
        const [activeOrderRows, pendingItemRows, unresolvedRows, openShiftRows, failedPrintRows] = await Promise.all([
          db.select({ id: orders.id }).from(orders).where(inArray(orders.status, activeOrderStatuses)),
          db.select({ id: orderItems.id }).from(orderItems).where(inArray(orderItems.status, ["sent", "preparing", "ready"])),
          db.select({ id: serviceRequests.id }).from(serviceRequests).where(ne(serviceRequests.status, "resolved")),
          db.select({ id: cashShifts.id }).from(cashShifts).where(eq(cashShifts.status, "open")),
          db.select({ id: printQueueJobs.id }).from(printQueueJobs).where(eq(printQueueJobs.status, "failed")),
        ]);
        if (activeOrderRows.length || pendingItemRows.length || unresolvedRows.length) throw new Error("ยังมีออเดอร์ งานผลิต หรือคำขอบริการค้างอยู่");
        if (openShiftRows.length) throw new Error("กรุณาปิดกะเงินสดก่อนอนุมัติปิดร้าน");
        if (failedPrintRows.length) throw new Error("ยังมีคิวเครื่องพิมพ์ที่ล้มเหลว กรุณาแก้ไขก่อนปิดร้าน");
      }
      const note = String(body.note ?? "").trim().slice(0, 500);
      await db.insert(openingClosingRuns).values({
        id: id("daily"),
        serviceDate,
        runType,
        status: "completed",
        checks: JSON.stringify(checks),
        note,
        approvedBy: profile.id,
        approvedAt: now,
        createdAt: now,
      });
      await log(profile.id, runType === "opening" ? "APPROVE_OPENING" : "APPROVE_CLOSING", `${runType === "opening" ? "อนุมัติเปิดร้าน" : "อนุมัติปิดร้าน"} ${serviceDate} • ${checks.length} รายการ${note ? ` • ${note}` : ""}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "createGuestVisit") {
      if (!canHandleHost) throw new Error("หน้าที่ในกะนี้ไม่มีสิทธิ์ใช้งานจอต้อนรับ");
      const visitType = String(body.visitType ?? "") as "walk_in" | "reservation";
      if (!(["walk_in", "reservation"] as string[]).includes(visitType)) throw new Error("ประเภทการรับลูกค้าไม่ถูกต้อง");
      const customerName = requiredText(body.customerName, "ชื่อลูกค้า", 120);
      const phone = String(body.phone ?? "").replace(/[^0-9+\- ]/g, "").trim().slice(0, 30);
      if (visitType === "reservation" && phone.length < 9) throw new Error("กรุณาระบุเบอร์ติดต่อสำหรับการจอง");
      const roomNumber = String(body.roomNumber ?? "").trim().slice(0, 40);
      const note = String(body.note ?? "").trim().slice(0, 300);
      const guestCount = Math.round(Number(body.guestCount ?? 1));
      if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 30) throw new Error("จำนวนลูกค้าต้องอยู่ระหว่าง 1–30 คน");
      let scheduledAt: Date | null = null;
      if (visitType === "reservation") {
        scheduledAt = new Date(String(body.scheduledAt ?? ""));
        if (Number.isNaN(scheduledAt.getTime())) throw new Error("วันและเวลาจองไม่ถูกต้อง");
      }
      const visitId = id("guest");
      await db.insert(guestVisits).values({
        id: visitId,
        visitType,
        customerName,
        phone,
        roomNumber,
        guestCount,
        scheduledAt,
        note,
        status: visitType === "reservation" ? "reserved" : "waiting",
        createdBy: profile.id,
        createdAt: now,
        updatedAt: now,
      });
      await log(profile.id, visitType === "reservation" ? "CREATE_RESERVATION" : "ADD_WAITLIST", `${customerName} • ${guestCount} คน${roomNumber ? ` • ห้อง ${roomNumber}` : ""}`);
      return NextResponse.json({ ok: true, guestVisitId: visitId });
    }

    if (action === "updateGuestVisit") {
      if (!canHandleHost) throw new Error("หน้าที่ในกะนี้ไม่มีสิทธิ์ใช้งานจอต้อนรับ");
      const guestVisitId = String(body.guestVisitId ?? "");
      const [visit] = await db.select().from(guestVisits).where(eq(guestVisits.id, guestVisitId)).limit(1);
      if (!visit) throw new Error("ไม่พบรายการลูกค้า");
      if (["cancelled", "no_show", "completed"].includes(visit.status)) throw new Error("รายการนี้ปิดแล้ว ไม่สามารถแก้ไขได้");
      const customerName = requiredText(body.customerName, "ชื่อลูกค้า", 120);
      const phone = String(body.phone ?? "").replace(/[^0-9+\- ]/g, "").trim().slice(0, 30);
      if (visit.visitType === "reservation" && phone.length < 9) throw new Error("กรุณาระบุเบอร์ติดต่อสำหรับการจอง");
      const roomNumber = String(body.roomNumber ?? "").trim().slice(0, 40);
      const note = String(body.note ?? "").trim().slice(0, 300);
      const guestCount = Math.round(Number(body.guestCount ?? 1));
      if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 30) throw new Error("จำนวนลูกค้าต้องอยู่ระหว่าง 1–30 คน");
      let scheduledAt = visit.scheduledAt;
      if (visit.visitType === "reservation") {
        scheduledAt = new Date(String(body.scheduledAt ?? ""));
        if (Number.isNaN(scheduledAt.getTime())) throw new Error("วันและเวลาจองไม่ถูกต้อง");
      }
      await db.update(guestVisits).set({ customerName, phone, roomNumber, guestCount, scheduledAt, note, updatedAt: now }).where(eq(guestVisits.id, guestVisitId));
      await log(profile.id, "UPDATE_GUEST_VISIT", `${customerName} • ${guestCount} คน • ${visit.status}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "setGuestVisitStatus") {
      if (!canHandleHost) throw new Error("หน้าที่ในกะนี้ไม่มีสิทธิ์ใช้งานจอต้อนรับ");
      const guestVisitId = String(body.guestVisitId ?? "");
      const status = String(body.status ?? "") as "reserved" | "waiting" | "cancelled" | "no_show" | "completed";
      if (!(["reserved", "waiting", "cancelled", "no_show", "completed"] as string[]).includes(status)) throw new Error("สถานะลูกค้าไม่ถูกต้อง");
      const [visit] = await db.select().from(guestVisits).where(eq(guestVisits.id, guestVisitId)).limit(1);
      if (!visit) throw new Error("ไม่พบรายการลูกค้า");
      const allowed: Record<string, string[]> = {
        reserved: ["waiting", "cancelled", "no_show"],
        waiting: ["reserved", "cancelled", "no_show"],
        seated: ["completed"],
      };
      if (!allowed[visit.status]?.includes(status)) throw new Error("ไม่สามารถเปลี่ยนเป็นสถานะนี้ได้");
      await db.update(guestVisits).set({ status, updatedAt: now }).where(eq(guestVisits.id, guestVisitId));
      await log(profile.id, "UPDATE_GUEST_STATUS", `${visit.customerName} • ${visit.status} → ${status}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "seatGuestVisit") {
      if (!canHandleHost) throw new Error("หน้าที่ในกะนี้ไม่มีสิทธิ์ใช้งานจอต้อนรับ");
      const guestVisitId = String(body.guestVisitId ?? "");
      const tableId = Number(body.tableId);
      const [[visit], [table]] = await Promise.all([
        db.select().from(guestVisits).where(eq(guestVisits.id, guestVisitId)).limit(1),
        db.select().from(diningTables).where(eq(diningTables.id, tableId)).limit(1),
      ]);
      if (!visit || !["reserved", "waiting"].includes(visit.status)) throw new Error("รายการลูกค้านี้ไม่พร้อมจัดโต๊ะ");
      if (!table) throw new Error("ไม่พบโต๊ะ");
      if (table.status !== "available") throw new Error("โต๊ะนี้ไม่ว่าง กรุณาเลือกโต๊ะอื่น");
      if (table.seats < visit.guestCount) throw new Error(`โต๊ะนี้รองรับ ${table.seats} ที่นั่ง แต่ลูกค้ามี ${visit.guestCount} คน`);
      const [existing] = await db.select().from(orders).where(and(eq(orders.tableId, tableId), inArray(orders.status, ["open", "sent", "preparing", "ready", "served"]))).limit(1);
      if (existing) throw new Error("โต๊ะนี้มีออเดอร์เปิดอยู่แล้ว");
      const orderId = id("ord");
      const orderNumber = `T${String(table.number).padStart(2, "0")}-${Date.now().toString().slice(-6)}`;
      await db.insert(orders).values({ id: orderId, orderNumber, tableId, openedBy: profile.id, status: "open", subtotal: 0, total: 0, openedAt: now, updatedAt: now });
      await db.update(diningTables).set({ status: "occupied" }).where(eq(diningTables.id, tableId));
      await db.update(guestVisits).set({ status: "seated", tableId, orderId, seatedAt: now, seatedBy: profile.id, updatedAt: now }).where(eq(guestVisits.id, guestVisitId));
      const guestDetail = `${visit.customerName} • ${visit.guestCount} คน${visit.roomNumber ? ` • ห้อง ${visit.roomNumber}` : ""}`;
      await db.insert(serviceRequests).values({ id: id("svc"), tableId, orderId, type: "seated", status: "open", note: `พาลูกค้านั่งแล้ว: ${guestDetail}${visit.note ? ` • ${visit.note}` : ""}`, createdAt: now });
      await log(profile.id, "SEAT_GUEST", `${guestDetail} → โต๊ะ ${table.number} (${orderNumber})`);
      return NextResponse.json({ ok: true, orderId, tableId });
    }

    if (action === "openDutyShift") {
      if (!isManagement) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      if (dutyAccess.shift) throw new Error("มีกะปฏิบัติงานที่เปิดอยู่แล้ว กรุณาปิดกะเดิมก่อน");
      const label = requiredText(body.label, "ชื่อกะ", 80);
      const serviceDate = String(body.serviceDate ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) throw new Error("วันที่ปฏิบัติงานไม่ถูกต้อง");
      const shiftId = id("duty");
      await db.insert(dutyShifts).values({ id: shiftId, label, serviceDate, status: "open", openedBy: profile.id, openedAt: now });
      await log(profile.id, "OPEN_DUTY_SHIFT", `เปิดกะ ${label} • ${serviceDate}`);
      return NextResponse.json({ ok: true, dutyShiftId: shiftId });
    }

    if (action === "assignDutyStation") {
      if (!isManagement) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      const [shift] = await db.select().from(dutyShifts).where(eq(dutyShifts.status, "open")).orderBy(desc(dutyShifts.openedAt)).limit(1);
      if (!shift) throw new Error("กรุณาเปิดกะปฏิบัติงานก่อน");
      const userId = String(body.userId ?? "");
      const station = String(body.station ?? "") as DutyStation;
      if (!dutyStationValues.includes(station)) throw new Error("จุดปฏิบัติงานไม่ถูกต้อง");
      const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!target?.active || target.role === "instructor") throw new Error("ไม่พบบัญชีนักศึกษาหรือพนักงานที่มอบหมายได้");
      const [existing] = await db.select().from(dutyAssignments).where(and(eq(dutyAssignments.dutyShiftId, shift.id), eq(dutyAssignments.userId, userId))).limit(1);
      if (existing) {
        await db.update(dutyAssignments).set({ station, status: "assigned", assignedBy: profile.id, assignedAt: now, checkedInAt: null, checkedOutAt: null }).where(eq(dutyAssignments.id, existing.id));
      } else {
        await db.insert(dutyAssignments).values({ id: id("assign"), dutyShiftId: shift.id, userId, station, status: "assigned", assignedBy: profile.id, assignedAt: now });
      }
      await log(profile.id, "ASSIGN_DUTY", `${target.name} → ${station} • ${shift.label}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "checkInDuty") {
      const userId = isManagement && body.userId ? String(body.userId) : profile.id;
      const [shift] = await db.select().from(dutyShifts).where(eq(dutyShifts.status, "open")).orderBy(desc(dutyShifts.openedAt)).limit(1);
      if (!shift) throw new Error("ยังไม่มีกะปฏิบัติงานที่เปิดอยู่");
      const [assignment] = await db.select().from(dutyAssignments).where(and(eq(dutyAssignments.dutyShiftId, shift.id), eq(dutyAssignments.userId, userId))).limit(1);
      if (!assignment) throw new Error("ยังไม่ได้รับมอบหมายหน้าที่ในกะนี้");
      if (assignment.status === "checked_in") return NextResponse.json({ ok: true, duplicate: true });
      await db.update(dutyAssignments).set({ status: "checked_in", checkedInAt: now, checkedOutAt: null }).where(eq(dutyAssignments.id, assignment.id));
      await log(profile.id, "DUTY_CHECK_IN", `${userId} • ${assignment.station} • ${shift.label}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "checkOutDuty") {
      const userId = isManagement && body.userId ? String(body.userId) : profile.id;
      const [shift] = await db.select().from(dutyShifts).where(eq(dutyShifts.status, "open")).orderBy(desc(dutyShifts.openedAt)).limit(1);
      if (!shift) throw new Error("ยังไม่มีกะปฏิบัติงานที่เปิดอยู่");
      const [assignment] = await db.select().from(dutyAssignments).where(and(eq(dutyAssignments.dutyShiftId, shift.id), eq(dutyAssignments.userId, userId))).limit(1);
      if (!assignment || assignment.status !== "checked_in") throw new Error("ผู้ใช้นี้ยังไม่ได้ลงเวลาเข้างาน");
      await db.update(dutyAssignments).set({ status: "checked_out", checkedOutAt: now }).where(eq(dutyAssignments.id, assignment.id));
      await log(profile.id, "DUTY_CHECK_OUT", `${userId} • ${assignment.station} • ${shift.label}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "closeDutyShift") {
      if (!isManagement) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      const [shift] = await db.select().from(dutyShifts).where(eq(dutyShifts.status, "open")).orderBy(desc(dutyShifts.openedAt)).limit(1);
      if (!shift) throw new Error("ไม่มีกะปฏิบัติงานที่เปิดอยู่");
      await db.update(dutyAssignments).set({ status: "checked_out", checkedOutAt: now }).where(and(eq(dutyAssignments.dutyShiftId, shift.id), eq(dutyAssignments.status, "checked_in")));
      await db.update(dutyShifts).set({ status: "closed", closedBy: profile.id, closedAt: now }).where(eq(dutyShifts.id, shift.id));
      await log(profile.id, "CLOSE_DUTY_SHIFT", `ปิดกะ ${shift.label} • ${shift.serviceDate}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "setServiceRequest") {
      if (!canHandleService) throw new Error("หน้าที่ในกะนี้ไม่มีสิทธิ์รับคำขอบริการ");
      const requestId = String(body.requestId ?? "");
      const status = String(body.status) as "acknowledged" | "resolved";
      const [service] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, requestId)).limit(1);
      if (!service) throw new Error("ไม่พบคำขอบริการ");
      if (status === "acknowledged" && service.status === "open") {
        await db.update(serviceRequests).set({ status, acknowledgedAt: now, acknowledgedBy: profile.id }).where(eq(serviceRequests.id, requestId));
      } else if (status === "resolved" && service.status === "acknowledged") {
        await db.update(serviceRequests).set({ status, resolvedAt: now, resolvedBy: profile.id }).where(eq(serviceRequests.id, requestId));
      } else throw new Error("สถานะคำขอไม่ถูกต้อง");
      await log(profile.id, "SERVICE_REQUEST", `${requestId} → ${status}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "regenerateTableToken") {
      if (!managementRoles.has(profile.role)) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      const tableId = Number(body.tableId);
      const [table] = await db.select().from(diningTables).where(eq(diningTables.id, tableId)).limit(1);
      if (!table) throw new Error("ไม่พบโต๊ะ");
      await db.update(diningTables).set({ publicToken: crypto.randomUUID().replaceAll("-", "") }).where(eq(diningTables.id, tableId));
      await log(profile.id, "REGENERATE_TABLE_QR", `ออก QR ใหม่สำหรับโต๊ะ ${table.number}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "setDeliverySettings") {
      if (!managementRoles.has(profile.role)) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      const lineGroupUrl = String(body.lineGroupUrl ?? "").trim();
      if (lineGroupUrl && !/^https:\/\/(line\.me|chat\.line\.biz)\//i.test(lineGroupUrl)) throw new Error("กรุณาใช้ลิงก์เชิญกลุ่ม LINE ที่ขึ้นต้นด้วย https://line.me/");
      await db.insert(appSettings).values({ key: "line_group_url", value: lineGroupUrl, updatedAt: now, updatedBy: profile.id }).onConflictDoUpdate({ target: appSettings.key, set: { value: lineGroupUrl, updatedAt: now, updatedBy: profile.id } });
      await log(profile.id, "DELIVERY_SETTINGS", lineGroupUrl ? "อัปเดตลิงก์กลุ่ม LINE" : "ปิดลิงก์กลุ่ม LINE");
      return NextResponse.json({ ok: true });
    }

    if (action === "setBillingSettings") {
      if (!managementRoles.has(profile.role)) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      const vatRate = Number(body.vatRate ?? 0);
      const serviceChargeRate = Number(body.serviceChargeRate ?? 0);
      const promptPayId = String(body.promptPayId ?? "").replace(/\D/g, "");
      const promptPayName = String(body.promptPayName ?? "").trim();
      parseRate(vatRate, "VAT");
      parseRate(serviceChargeRate, "ค่าบริการ");
      if (promptPayId && ![10, 13].includes(promptPayId.length)) throw new Error("พร้อมเพย์ต้องเป็นเบอร์โทร 10 หลัก หรือเลขประจำตัว 13 หลัก");
      if (promptPayId && (!promptPayName || promptPayName.length > 100)) throw new Error("กรุณาระบุชื่อบัญชีพร้อมเพย์ไม่เกิน 100 ตัวอักษร");
      for (const [key, value] of [["vat_rate", vatRate], ["service_charge_rate", serviceChargeRate], ["promptpay_id", promptPayId], ["promptpay_name", promptPayName]] as const) {
        await db.insert(appSettings).values({ key, value: String(value), updatedAt: now, updatedBy: profile.id }).onConflictDoUpdate({
          target: appSettings.key,
          set: { value: String(value), updatedAt: now, updatedBy: profile.id },
        });
      }
      await log(profile.id, "BILLING_SETTINGS", `VAT ${vatRate}% • Service ${serviceChargeRate}% • พร้อมเพย์ ${promptPayId ? `***${promptPayId.slice(-4)}` : "ปิด"}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "setPrinterSettings") {
      if (!managementRoles.has(profile.role)) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      const paperWidth = Number(body.paperWidth) === 58 ? 58 : 80;
      const rawMappings = body.categoryDepartments;
      if (!rawMappings || typeof rawMappings !== "object" || Array.isArray(rawMappings)) throw new Error("การตั้งค่าแผนกไม่ถูกต้อง");
      const categoryDepartments: Record<string, string> = {};
      for (const [categoryValue, departmentValue] of Object.entries(rawMappings as Record<string, unknown>).slice(0, 100)) {
        const category = String(categoryValue).trim();
        const department = String(departmentValue ?? "").trim();
        if (!category || category.length > 80 || !department || department.length > 80) throw new Error("ชื่อหมวดหมู่หรือแผนกไม่ถูกต้อง");
        categoryDepartments[category] = department;
      }
      for (const [key, value] of [["printer_paper_width", String(paperWidth)], ["printer_category_departments", JSON.stringify(categoryDepartments)]] as const) {
        await db.insert(appSettings).values({ key, value, updatedAt: now, updatedBy: profile.id }).onConflictDoUpdate({
          target: appSettings.key,
          set: { value, updatedAt: now, updatedBy: profile.id },
        });
      }
      await log(profile.id, "PRINTER_SETTINGS", `ตั้งค่ากระดาษ ${paperWidth} มม. • ${Object.keys(categoryDepartments).length} หมวดหมู่`);
      return NextResponse.json({ ok: true });
    }

    if (action === "claimPrintQueueJob") {
      const jobId = String(body.jobId ?? "");
      const [job] = await db.select().from(printQueueJobs).where(eq(printQueueJobs.id, jobId)).limit(1);
      if (!job) throw new Error("ไม่พบคิวงานพิมพ์");
      if (!isManagement && !(job.department === "บาร์เครื่องดื่ม" ? canHandleBar : canHandleKitchen)) throw new Error("หน้าที่ในกะนี้ไม่มีสิทธิ์รับคิวงานพิมพ์จุดนี้");
      if (job.status !== "pending") return NextResponse.json({ ok: true, skipped: true });
      const [alreadyPrinted] = await db.select({ id: printJobs.id }).from(printJobs)
        .where(and(eq(printJobs.orderId, job.orderId), eq(printJobs.documentType, "kitchen"), eq(printJobs.department, job.department))).limit(1);
      if (alreadyPrinted) {
        await db.update(printQueueJobs).set({ status: "printed", handledBy: profile.id, updatedAt: now, completedAt: now, lastError: "พิมพ์จากปุ่มด้วยตนเองแล้ว" }).where(eq(printQueueJobs.id, job.id));
        return NextResponse.json({ ok: true, skipped: true });
      }
      const claimed = await db.update(printQueueJobs).set({ status: "processing", attempts: job.attempts + 1, handledBy: profile.id, updatedAt: now, lastError: "" })
        .where(and(eq(printQueueJobs.id, job.id), eq(printQueueJobs.status, "pending"))).returning();
      if (!claimed.length) return NextResponse.json({ ok: true, skipped: true });
      return NextResponse.json({ ok: true, queueJob: { ...claimed[0], itemIds: JSON.parse(claimed[0].itemIds) as string[] } });
    }

    if (action === "completePrintQueueJob") {
      const jobId = String(body.jobId ?? "");
      const [job] = await db.select().from(printQueueJobs).where(eq(printQueueJobs.id, jobId)).limit(1);
      if (!job) throw new Error("ไม่พบคิวงานพิมพ์");
      if (!isManagement && !(job.department === "บาร์เครื่องดื่ม" ? canHandleBar : canHandleKitchen)) throw new Error("หน้าที่ในกะนี้ไม่มีสิทธิ์ยืนยันงานพิมพ์จุดนี้");
      if (job.status === "printed") return NextResponse.json({ ok: true, duplicate: true });
      if (job.status !== "processing" || job.handledBy !== profile.id) throw new Error("คิวนี้ถูกเครื่องอื่นรับไปแล้ว");
      const [previous] = await db.select().from(printJobs).where(and(eq(printJobs.orderId, job.orderId), eq(printJobs.documentType, "kitchen"), eq(printJobs.department, job.department))).orderBy(desc(printJobs.copyNumber)).limit(1);
      if (!previous) {
        await db.insert(printJobs).values({ id: id("print"), orderId: job.orderId, documentType: "kitchen", department: job.department, copyNumber: 1, printedBy: profile.id, printedAt: now, reprintReason: "" });
      }
      await db.update(printQueueJobs).set({ status: "printed", updatedAt: now, completedAt: now, lastError: "" }).where(eq(printQueueJobs.id, job.id));
      await log(profile.id, "AUTO_PRINT_KITCHEN", `ส่งใบครัวอัตโนมัติ ${job.orderId} • ${job.department} • ครั้งที่ ${job.attempts}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "failPrintQueueJob") {
      const jobId = String(body.jobId ?? "");
      const [job] = await db.select().from(printQueueJobs).where(eq(printQueueJobs.id, jobId)).limit(1);
      if (job && !isManagement && !(job.department === "บาร์เครื่องดื่ม" ? canHandleBar : canHandleKitchen)) throw new Error("หน้าที่ในกะนี้ไม่มีสิทธิ์อัปเดตคิวงานพิมพ์จุดนี้");
      if (!job || job.status !== "processing" || job.handledBy !== profile.id) return NextResponse.json({ ok: true, skipped: true });
      const lastError = String(body.error ?? "เปิดหน้าต่างพิมพ์ไม่สำเร็จ").trim().slice(0, 300) || "เปิดหน้าต่างพิมพ์ไม่สำเร็จ";
      const retrying = job.attempts < 3;
      await db.update(printQueueJobs).set({ status: retrying ? "pending" : "failed", updatedAt: now, handledBy: retrying ? null : profile.id, lastError }).where(eq(printQueueJobs.id, job.id));
      if (!retrying) await log(profile.id, "AUTO_PRINT_FAILED", `พิมพ์ใบครัวไม่สำเร็จ ${job.orderId} • ${job.department} • ${lastError}`);
      return NextResponse.json({ ok: true, retrying });
    }

    if (action === "retryPrintQueueJob") {
      const jobId = String(body.jobId ?? "");
      const [job] = await db.select().from(printQueueJobs).where(eq(printQueueJobs.id, jobId)).limit(1);
      if (job && !isManagement && !(job.department === "บาร์เครื่องดื่ม" ? canHandleBar : canHandleKitchen)) throw new Error("หน้าที่ในกะนี้ไม่มีสิทธิ์สั่งพิมพ์จุดนี้");
      if (!job || job.status !== "failed") throw new Error("งานนี้ไม่ได้อยู่ในสถานะล้มเหลว");
      await db.update(printQueueJobs).set({ status: "pending", attempts: 0, handledBy: null, updatedAt: now, lastError: "สั่งลองใหม่โดยผู้ควบคุม" }).where(eq(printQueueJobs.id, job.id));
      await log(profile.id, "AUTO_PRINT_RETRY", `สั่งลองพิมพ์ใหม่ ${job.orderId} • ${job.department}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "recordPrint") {
      const documentType = String(body.documentType ?? "") as "kitchen" | "receipt";
      if (!(["kitchen", "receipt"] as string[]).includes(documentType)) throw new Error("ประเภทเอกสารไม่ถูกต้อง");
      if (documentType === "receipt" && !canReceivePayment) throw new Error("ไม่มีสิทธิ์พิมพ์ใบเสร็จ");
      const orderId = String(body.orderId ?? "");
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order) throw new Error("ไม่พบออเดอร์");
      const rawDepartments = documentType === "receipt" ? [""] : Array.isArray(body.departments) ? body.departments : [];
      const departments = Array.from(new Set(rawDepartments.map((value) => String(value ?? "").trim()).filter(Boolean))).slice(0, 12);
      if (documentType === "kitchen" && !departments.length) throw new Error("กรุณาเลือกแผนกที่จะพิมพ์");
      if (documentType === "kitchen" && !isManagement && departments.some((department) => department === "บาร์เครื่องดื่ม" ? !canHandleBar : !canHandleKitchen)) throw new Error("หน้าที่ในกะนี้ไม่มีสิทธิ์พิมพ์ใบของแผนกนี้");
      if (departments.some((department) => department.length > 80)) throw new Error("ชื่อแผนกยาวเกินไป");
      const targets = documentType === "receipt" ? [""] : departments;
      const reprintReason = String(body.reprintReason ?? "").trim();
      if (reprintReason.length > 300) throw new Error("เหตุผลพิมพ์ซ้ำต้องไม่เกิน 300 ตัวอักษร");
      const jobs = [];
      for (const department of targets) {
        const [previous] = await db.select().from(printJobs).where(and(eq(printJobs.orderId, orderId), eq(printJobs.documentType, documentType), eq(printJobs.department, department))).orderBy(desc(printJobs.copyNumber)).limit(1);
        if (previous && !reprintReason) throw new Error("กรุณาระบุเหตุผลการพิมพ์ซ้ำ");
        const copyNumber = (previous?.copyNumber ?? 0) + 1;
        const job = { id: id("print"), orderId, documentType, department, copyNumber, printedBy: profile.id, printedAt: now, reprintReason: previous ? reprintReason : "" };
        await db.insert(printJobs).values(job);
        await db.update(printQueueJobs).set({ status: "printed", handledBy: profile.id, updatedAt: now, completedAt: now, lastError: "พิมพ์จากปุ่มด้วยตนเอง" })
          .where(and(eq(printQueueJobs.orderId, orderId), eq(printQueueJobs.department, department), eq(printQueueJobs.status, "pending")));
        jobs.push({ ...job, printedByName: profile.name });
      }
      const reprint = jobs.some((job) => job.copyNumber > 1);
      const actionName = `${reprint ? "REPRINT" : "PRINT"}_${documentType === "kitchen" ? "KITCHEN" : "RECEIPT"}`;
      const targetLabel = documentType === "kitchen" ? departments.join(", ") : order.receiptNumber ?? order.orderNumber;
      await log(profile.id, actionName, `${reprint ? "พิมพ์ซ้ำ" : "พิมพ์"}${documentType === "kitchen" ? "ใบครัว" : "ใบเสร็จ"} ${order.orderNumber} • ${targetLabel}${reprint ? ` • เหตุผล: ${reprintReason}` : ""}`);
      return NextResponse.json({ ok: true, printJobs: jobs });
    }

    if (action === "openShift") {
      if (!paymentRoles.has(profile.role)) throw new Error("ไม่มีสิทธิ์เปิดกะ");
      const [open] = await db.select().from(cashShifts).where(eq(cashShifts.status, "open")).limit(1);
      if (open) throw new Error("มีกะที่เปิดอยู่แล้ว กรุณาปิดกะเดิมก่อน");
      const openingCash = Math.max(0, Math.round(Number(body.openingCash ?? 0) * 100));
      if (!Number.isFinite(openingCash)) throw new Error("เงินสดเริ่มต้นไม่ถูกต้อง");
      const shiftId = id("shift");
      await db.insert(cashShifts).values({ id: shiftId, openedBy: profile.id, openingCash, status: "open", openedAt: now });
      await log(profile.id, "OPEN_SHIFT", `เปิดกะ เงินสดเริ่มต้น ${(openingCash / 100).toFixed(2)} บาท`);
      return NextResponse.json({ ok: true, shiftId });
    }

    if (action === "cashMovement") {
      if (!paymentRoles.has(profile.role)) throw new Error("ไม่มีสิทธิ์บันทึกเงินสด");
      const [shift] = await db.select().from(cashShifts).where(eq(cashShifts.status, "open")).limit(1);
      if (!shift) throw new Error("กรุณาเปิดกะก่อนบันทึกเงินสด");
      const type = String(body.type) as "cash_in" | "cash_out";
      if (!["cash_in", "cash_out"].includes(type)) throw new Error("ประเภทรายการเงินสดไม่ถูกต้อง");
      const amount = Math.round(positiveNumber(body.amount, "จำนวนเงิน") * 100);
      const note = requiredText(body.note, "เหตุผล", 200);
      await db.insert(cashMovements).values({ id: id("cash"), shiftId: shift.id, type, amount, note, actorId: profile.id, createdAt: now });
      await log(profile.id, type === "cash_in" ? "CASH_IN" : "CASH_OUT", `${note} ${(amount / 100).toFixed(2)} บาท`);
      return NextResponse.json({ ok: true });
    }

    if (action === "closeShift") {
      if (!paymentRoles.has(profile.role)) throw new Error("ไม่มีสิทธิ์ปิดกะ");
      const [shift] = await db.select().from(cashShifts).where(eq(cashShifts.status, "open")).limit(1);
      if (!shift) throw new Error("ไม่มีกะที่เปิดอยู่");
      const closingCash = Math.max(0, Math.round(Number(body.closingCash ?? 0) * 100));
      if (!Number.isFinite(closingCash)) throw new Error("ยอดเงินสดปลายกะไม่ถูกต้อง");
      const [cashPaymentRows, movementRows] = await Promise.all([
        db.select().from(orderPayments).where(and(eq(orderPayments.shiftId, shift.id), eq(orderPayments.method, "cash"), eq(orderPayments.status, "confirmed"))),
        db.select().from(cashMovements).where(eq(cashMovements.shiftId, shift.id)),
      ]);
      const expectedCash = shift.openingCash
        + cashPaymentRows.reduce((sum, row) => sum + row.amount, 0)
        + movementRows.reduce((sum, row) => sum + (row.type === "cash_in" ? row.amount : -row.amount), 0);
      const difference = closingCash - expectedCash;
      const note = String(body.note ?? "").trim().slice(0, 300);
      await db.update(cashShifts).set({ status: "closed", closedBy: profile.id, closedAt: now, expectedCash, closingCash, difference, note }).where(eq(cashShifts.id, shift.id));
      await log(profile.id, "CLOSE_SHIFT", `ปิดกะ คาด ${expectedCash / 100} จริง ${closingCash / 100} ต่าง ${difference / 100} บาท`);
      return NextResponse.json({ ok: true, expectedCash, difference });
    }

    if (action === "setDeliveryStatus") {
      const orderId = String(body.orderId);
      const status = String(body.status) as "confirmed" | "preparing" | "out_for_delivery" | "near_arrival" | "delivered" | "cancelled";
      const [order] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, orderId)).limit(1);
      if (!order) throw new Error("ไม่พบออเดอร์เดลิเวอรี");
      const allowed: Record<string, string[]> = { pending: ["confirmed", "cancelled"], confirmed: ["preparing"], preparing: ["out_for_delivery"], out_for_delivery: ["near_arrival"], near_arrival: ["delivered"] };
      if (!allowed[order.status]?.includes(status)) throw new Error("ไม่สามารถเปลี่ยนเป็นสถานะนี้ได้");
      const management = isManagement;
      const riderAction = status === "out_for_delivery" || status === "near_arrival" || status === "delivered";
      if (!canHandleDelivery) throw new Error("หน้าที่ในกะนี้ไม่มีสิทธิ์จัดการงานส่งอาหาร");
      if (!management && !riderAction) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      if ((status === "near_arrival" || status === "delivered") && !management && order.riderId !== profile.id) throw new Error("งานนี้มีนักศึกษาคนอื่นรับไปแล้ว");
      if (status === "out_for_delivery" && order.riderId && order.riderId !== profile.id && !management) throw new Error("งานนี้มีนักศึกษาคนอื่นรับไปแล้ว");
      if (status === "delivered") {
        const soldItems = await db.select().from(deliveryOrderItems).where(eq(deliveryOrderItems.orderId, orderId));
        const menuIds = Array.from(new Set(soldItems.map((item) => item.menuItemId)));
        const recipes = menuIds.length ? await db.select().from(menuRecipes).where(inArray(menuRecipes.menuItemId, menuIds)) : [];
        const required = new Map<string, number>();
        for (const soldItem of soldItems) for (const recipe of recipes.filter((row) => row.menuItemId === soldItem.menuItemId)) required.set(recipe.inventoryItemId, (required.get(recipe.inventoryItemId) ?? 0) + recipe.quantity * soldItem.quantity);
        const inventoryIds = Array.from(required.keys());
        const stockRows = inventoryIds.length ? await db.select().from(inventoryItems).where(inArray(inventoryItems.id, inventoryIds)) : [];
        const insufficient = stockRows.filter((item) => item.currentStock < (required.get(item.id) ?? 0));
        if (insufficient.length) throw new Error(`สต๊อกไม่พอ: ${insufficient.map((item) => item.name).join(", ")}`);
        for (const item of stockRows) {
          const used = required.get(item.id) ?? 0;
          if (!used) continue;
          await db.update(inventoryItems).set({ currentStock: item.currentStock - used, updatedAt: now }).where(eq(inventoryItems.id, item.id));
          await db.insert(stockMovements).values({ id: id("move"), inventoryItemId: item.id, type: "sale", quantityDelta: -used, referenceId: orderId, note: order.orderNumber, actorId: profile.id, createdAt: now });
        }
      }
      const statusUpdate = {
        status,
        updatedAt: now,
        ...(status === "confirmed" ? { confirmedAt: now } : {}),
        ...(status === "out_for_delivery" ? { riderId: order.riderId ?? profile.id, pickedUpAt: now } : {}),
        ...(status === "near_arrival" ? { nearArrivalAt: now } : {}),
        ...(status === "delivered" ? { deliveredAt: now } : {}),
      };
      if (status === "out_for_delivery") {
        await db.update(deliveryOrders).set(statusUpdate).where(and(eq(deliveryOrders.id, orderId), eq(deliveryOrders.status, "preparing"), isNull(deliveryOrders.riderId)));
        const [claimed] = await db.select({ status: deliveryOrders.status, riderId: deliveryOrders.riderId }).from(deliveryOrders).where(eq(deliveryOrders.id, orderId)).limit(1);
        if (claimed?.status !== "out_for_delivery" || claimed.riderId !== (order.riderId ?? profile.id)) throw new Error("งานนี้มีผู้รับไปก่อนแล้ว กรุณารีเฟรช");
      } else {
        await db.update(deliveryOrders).set(statusUpdate).where(eq(deliveryOrders.id, orderId));
      }
      await log(profile.id, "DELIVERY_STATUS", `${order.orderNumber} → ${status}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "createMenu") {
      if (!managementRoles.has(profile.role)) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      const name = requiredText(body.name, "ชื่อเมนู", 100);
      const category = requiredText(body.category, "หมวดหมู่", 60);
      const description = String(body.description ?? "").trim().slice(0, 500);
      const price = Math.round(positiveNumber(body.price, "ราคา") * 100);
      const [created] = await db.insert(menuItems).values({ name, category, description, price, active: true, available: true }).returning({ id: menuItems.id });
      await saveMenuImage(created.id, body.imageData, now);
      await log(profile.id, "CREATE_MENU", `เพิ่มเมนู ${name}`);
      return NextResponse.json({ ok: true, menuItemId: created.id });
    }

    if (action === "updateMenu") {
      if (!managementRoles.has(profile.role)) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      const menuItemId = Number(body.menuItemId);
      const [existing] = await db.select().from(menuItems).where(eq(menuItems.id, menuItemId)).limit(1);
      if (!existing) throw new Error("ไม่พบเมนู");
      const name = requiredText(body.name, "ชื่อเมนู", 100);
      const category = requiredText(body.category, "หมวดหมู่", 60);
      const description = String(body.description ?? "").trim().slice(0, 500);
      const price = Math.round(positiveNumber(body.price, "ราคา") * 100);
      await db.update(menuItems).set({ name, category, description, price }).where(eq(menuItems.id, menuItemId));
      await saveMenuImage(menuItemId, body.imageData, now);
      const changes = [
        existing.name !== name ? `ชื่อ “${existing.name}” → “${name}”` : "",
        existing.category !== category ? `หมวด ${existing.category} → ${category}` : "",
        existing.price !== price ? `ราคา ${(existing.price / 100).toFixed(2)} → ${(price / 100).toFixed(2)} บาท` : "",
      ].filter(Boolean).join(" • ");
      await log(profile.id, "UPDATE_MENU", `แก้ไขเมนู ${name}${changes ? ` • ${changes}` : ""}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "setMenuStatus") {
      if (!managementRoles.has(profile.role)) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      const menuItemId = Number(body.menuItemId);
      const field = String(body.field);
      const [menu] = await db.select().from(menuItems).where(eq(menuItems.id, menuItemId)).limit(1);
      if (!menu) throw new Error("ไม่พบเมนู");
      if (field === "available") await db.update(menuItems).set({ available: Boolean(body.value) }).where(eq(menuItems.id, menuItemId));
      else if (field === "active") await db.update(menuItems).set({ active: Boolean(body.value) }).where(eq(menuItems.id, menuItemId));
      else throw new Error("สถานะเมนูไม่ถูกต้อง");
      await log(profile.id, "MENU_STATUS", `${menu.name} • ${field === "available" ? (Boolean(body.value) ? "เปิดขาย" : "หมดชั่วคราว") : (Boolean(body.value) ? "เปิดใช้งาน" : "ปิดขาย")}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "deleteMenu") {
      if (!managementRoles.has(profile.role)) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      const menuItemId = Number(body.menuItemId);
      const [menu] = await db.select().from(menuItems).where(eq(menuItems.id, menuItemId)).limit(1);
      if (!menu) throw new Error("ไม่พบเมนู");
      await db.update(menuItems).set({ active: false, available: false }).where(eq(menuItems.id, menuItemId));
      await log(profile.id, "ARCHIVE_MENU", `ลบ/ซ่อนเมนู ${menu.name} (รหัส ${menuItemId}) โดยเก็บประวัติการขายไว้`);
      return NextResponse.json({ ok: true });
    }

    if (action === "setRecipe") {
      if (!managementRoles.has(profile.role)) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      const menuItemId = Number(body.menuItemId);
      const [menu] = await db.select().from(menuItems).where(eq(menuItems.id, menuItemId)).limit(1);
      if (!menu) throw new Error("ไม่พบเมนู");
      const rawLines = Array.isArray(body.lines) ? body.lines : [];
      const lines = rawLines.map((raw) => {
        const line = raw as Record<string, unknown>;
        return { inventoryItemId: String(line.inventoryItemId), quantity: toMilliUnits(line.quantity, "ปริมาณสูตร") };
      }).filter((line) => line.inventoryItemId);
      await db.delete(menuRecipes).where(eq(menuRecipes.menuItemId, menuItemId));
      if (lines.length) await db.insert(menuRecipes).values(lines.map((line) => ({ id: id("recipe"), menuItemId, ...line })));
      await log(profile.id, "SET_RECIPE", `กำหนดสูตร ${menu.name} ${lines.length} วัตถุดิบ`);
      return NextResponse.json({ ok: true });
    }

    if (action === "createDailyStockCount") {
      if (!isManagement) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      const serviceDate = String(body.serviceDate ?? "");
      if (serviceDate !== bangkokServiceDate(now)) throw new Error("เริ่มตรวจนับได้เฉพาะรายการของวันนี้");
      const [existing] = await db.select().from(stockCountSessions).where(eq(stockCountSessions.serviceDate, serviceDate)).limit(1);
      if (existing) return NextResponse.json({ ok: true, duplicate: true, sessionId: existing.id });
      const activeItems = await db.select().from(inventoryItems).where(eq(inventoryItems.active, true)).orderBy(asc(inventoryItems.name));
      if (!activeItems.length) throw new Error("กรุณาเพิ่มวัตถุดิบก่อนเริ่มตรวจนับ");
      const sessionId = id("count");
      await db.insert(stockCountSessions).values({ id: sessionId, serviceDate, status: "draft", note: "", createdBy: profile.id, createdAt: now, updatedAt: now });
      await db.insert(stockCountLines).values(activeItems.map((item) => ({ id: id("count_line"), sessionId, inventoryItemId: item.id, snapshotStock: item.currentStock, countedStock: null, difference: 0, reason: "" })));
      await log(profile.id, "START_STOCK_COUNT", `เริ่มตรวจนับสต๊อก ${serviceDate} • ${activeItems.length} รายการ`);
      return NextResponse.json({ ok: true, sessionId });
    }

    if (action === "saveStockCountLines") {
      if (!isManagement) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      const sessionId = String(body.sessionId ?? "");
      const [session] = await db.select().from(stockCountSessions).where(eq(stockCountSessions.id, sessionId)).limit(1);
      if (!session) throw new Error("ไม่พบรอบตรวจนับ");
      if (session.status !== "draft") throw new Error("รอบตรวจนับนี้ถูกส่งอนุมัติแล้ว");
      const storedLines = await db.select().from(stockCountLines).where(eq(stockCountLines.sessionId, sessionId));
      const rawLines = Array.isArray(body.lines) ? body.lines : [];
      if (rawLines.length !== storedLines.length) throw new Error("กรุณานับวัตถุดิบให้ครบทุกชนิด");
      const inputByItemId = new Map<string, { countedStock: number; reason: string }>();
      for (const raw of rawLines) {
        if (!raw || typeof raw !== "object") throw new Error("ข้อมูลตรวจนับไม่ถูกต้อง");
        const row = raw as Record<string, unknown>;
        const inventoryItemId = String(row.inventoryItemId ?? "");
        if (inputByItemId.has(inventoryItemId)) throw new Error("พบวัตถุดิบซ้ำในใบนับ");
        inputByItemId.set(inventoryItemId, { countedStock: toNonNegativeMilliUnits(row.countedQuantity, "ยอดนับจริง"), reason: String(row.reason ?? "").trim().slice(0, 200) });
      }
      for (const line of storedLines) {
        const input = inputByItemId.get(line.inventoryItemId);
        if (!input) throw new Error("กรุณานับวัตถุดิบให้ครบทุกชนิด");
        const difference = input.countedStock - line.snapshotStock;
        if (difference !== 0 && input.reason.length < 2) throw new Error("รายการที่มีส่วนต่างต้องระบุสาเหตุ");
        await db.update(stockCountLines).set({ countedStock: input.countedStock, difference, reason: input.reason, countedBy: profile.id, countedAt: now }).where(eq(stockCountLines.id, line.id));
      }
      await db.update(stockCountSessions).set({ updatedAt: now }).where(eq(stockCountSessions.id, sessionId));
      await log(profile.id, "SAVE_STOCK_COUNT", `บันทึกร่างตรวจนับ ${session.serviceDate} • ${storedLines.length} รายการ`);
      return NextResponse.json({ ok: true });
    }

    if (action === "submitDailyStockCount") {
      if (!isManagement) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      const sessionId = String(body.sessionId ?? "");
      const [session] = await db.select().from(stockCountSessions).where(eq(stockCountSessions.id, sessionId)).limit(1);
      if (!session) throw new Error("ไม่พบรอบตรวจนับ");
      if (session.status !== "draft") throw new Error("รอบตรวจนับนี้ถูกส่งแล้ว");
      const lines = await db.select().from(stockCountLines).where(eq(stockCountLines.sessionId, sessionId));
      if (!lines.length || lines.some((line) => line.countedStock === null)) throw new Error("กรุณานับวัตถุดิบให้ครบทุกชนิด");
      const items = await db.select().from(inventoryItems).where(inArray(inventoryItems.id, lines.map((line) => line.inventoryItemId)));
      const itemById = new Map(items.map((item) => [item.id, item]));
      for (const line of lines) {
        const item = itemById.get(line.inventoryItemId);
        if (!item || line.countedStock === null) throw new Error("ข้อมูลวัตถุดิบในใบนับไม่ครบ");
        const difference = line.countedStock - item.currentStock;
        if (difference !== 0 && line.reason.trim().length < 2) throw new Error(`กรุณาระบุสาเหตุส่วนต่างของ ${item.name}`);
        await db.update(stockCountLines).set({ snapshotStock: item.currentStock, difference }).where(eq(stockCountLines.id, line.id));
      }
      const note = String(body.note ?? "").trim().slice(0, 500);
      await db.update(stockCountSessions).set({ status: "submitted", note, submittedBy: profile.id, submittedAt: now, updatedAt: now }).where(eq(stockCountSessions.id, sessionId));
      await log(profile.id, "SUBMIT_STOCK_COUNT", `ส่งตรวจนับ ${session.serviceDate} • ${lines.length} รายการ`);
      return NextResponse.json({ ok: true });
    }

    if (action === "approveDailyStockCount") {
      if (!isManagement) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      const sessionId = String(body.sessionId ?? "");
      const [session] = await db.select().from(stockCountSessions).where(eq(stockCountSessions.id, sessionId)).limit(1);
      if (!session) throw new Error("ไม่พบรอบตรวจนับ");
      if (session.status === "approved") return NextResponse.json({ ok: true, duplicate: true });
      if (session.status !== "submitted" || !session.submittedAt) throw new Error("กรุณาส่งผลตรวจนับก่อนอนุมัติ");
      const lines = await db.select().from(stockCountLines).where(eq(stockCountLines.sessionId, sessionId));
      if (!lines.length || lines.some((line) => line.countedStock === null)) throw new Error("ข้อมูลตรวจนับยังไม่ครบ");
      const items = await db.select().from(inventoryItems).where(inArray(inventoryItems.id, lines.map((line) => line.inventoryItemId)));
      const itemById = new Map(items.map((item) => [item.id, item]));
      const changedAfterSubmit = items.filter((item) => item.updatedAt.getTime() > session.submittedAt!.getTime());
      if (changedAfterSubmit.length) throw new Error(`สต๊อกมีการเคลื่อนไหวหลังส่งตรวจ: ${changedAfterSubmit.map((item) => item.name).join(", ")} กรุณาตรวจสอบก่อนอนุมัติ`);
      let adjusted = 0;
      for (const line of lines) {
        const item = itemById.get(line.inventoryItemId);
        if (!item || line.countedStock === null) throw new Error("ข้อมูลวัตถุดิบในใบนับไม่ครบ");
        const difference = line.countedStock - item.currentStock;
        if (difference !== 0) {
          adjusted += 1;
          await db.update(inventoryItems).set({ currentStock: line.countedStock, updatedAt: now }).where(eq(inventoryItems.id, item.id));
          await db.insert(stockMovements).values({ id: id("move"), inventoryItemId: item.id, type: "adjust", quantityDelta: difference, referenceId: sessionId, note: `ตรวจนับ ${session.serviceDate} • ${line.reason || "ปรับตามยอดจริง"}`, actorId: profile.id, createdAt: now });
        }
      }
      await db.update(stockCountSessions).set({ status: "approved", approvedBy: profile.id, approvedAt: now, updatedAt: now }).where(eq(stockCountSessions.id, sessionId));
      await log(profile.id, "APPROVE_STOCK_COUNT", `อนุมัติตรวจนับ ${session.serviceDate} • ปรับยอด ${adjusted}/${lines.length} รายการ`);
      return NextResponse.json({ ok: true, adjusted });
    }

    if (action === "createInventory") {
      if (!managementRoles.has(profile.role)) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      const sku = requiredText(body.sku, "รหัสวัตถุดิบ", 40).toUpperCase();
      const name = requiredText(body.name, "ชื่อวัตถุดิบ", 100);
      const unit = String(body.unit) as "kg" | "liter" | "unit" | "pack";
      if (!["kg", "liter", "unit", "pack"].includes(unit)) throw new Error("หน่วยนับไม่ถูกต้อง");
      const minimumStock = Math.max(0, Math.round(Number(body.minimumStock ?? 0) * 1000));
      await db.insert(inventoryItems).values({ id: id("inv"), sku, name, unit, minimumStock, currentStock: 0, active: true, createdAt: now, updatedAt: now });
      await log(profile.id, "CREATE_INVENTORY", `เพิ่มวัตถุดิบ ${sku} ${name}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "receiveStock") {
      if (!managementRoles.has(profile.role)) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      const inventoryItemId = String(body.inventoryItemId);
      const quantity = toMilliUnits(body.quantity, "จำนวนรับเข้า");
      const unitCost = Math.max(0, Math.round(Number(body.unitCost ?? 0) * 100));
      const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, inventoryItemId)).limit(1);
      if (!item) throw new Error("ไม่พบวัตถุดิบ");
      const receiptId = id("receipt");
      const documentNumber = requiredText(body.documentNumber, "เลขที่เอกสาร", 60);
      const supplier = requiredText(body.supplier, "ผู้จำหน่าย", 100);
      const note = String(body.note ?? "").trim().slice(0, 300);
      await db.insert(stockReceipts).values({ id: receiptId, documentNumber, supplier, note, receivedBy: profile.id, receivedAt: now });
      await db.insert(stockReceiptItems).values({ id: id("receipt_item"), receiptId, inventoryItemId, quantity, unitCost });
      await db.update(inventoryItems).set({ currentStock: item.currentStock + quantity, updatedAt: now }).where(eq(inventoryItems.id, inventoryItemId));
      await db.insert(stockMovements).values({ id: id("move"), inventoryItemId, type: "receive", quantityDelta: quantity, referenceId: receiptId, note: `${documentNumber} • ${supplier}`, actorId: profile.id, createdAt: now });
      await log(profile.id, "RECEIVE_STOCK", `รับ ${item.name} ${(quantity / 1000).toLocaleString("th-TH")} ${item.unit}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "adjustStock") {
      if (!managementRoles.has(profile.role)) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      const inventoryItemId = String(body.inventoryItemId);
      const quantityDelta = toMilliUnits(body.quantityDelta, "จำนวนปรับ", true);
      const note = requiredText(body.note, "เหตุผล", 300);
      const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, inventoryItemId)).limit(1);
      if (!item) throw new Error("ไม่พบวัตถุดิบ");
      const nextStock = item.currentStock + quantityDelta;
      if (nextStock < 0) throw new Error("ยอดสต๊อกหลังปรับต้องไม่ติดลบ");
      await db.update(inventoryItems).set({ currentStock: nextStock, updatedAt: now }).where(eq(inventoryItems.id, inventoryItemId));
      await db.insert(stockMovements).values({ id: id("move"), inventoryItemId, type: "adjust", quantityDelta, note, actorId: profile.id, createdAt: now });
      await log(profile.id, "ADJUST_STOCK", `ปรับ ${item.name} ${(item.currentStock / 1000).toLocaleString("th-TH")} → ${(nextStock / 1000).toLocaleString("th-TH")} ${item.unit} • เหตุผล: ${note}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "openOrder") {
      if (!canOperateTables) throw new Error("หน้าที่ในกะนี้ไม่มีสิทธิ์เปิดโต๊ะ");
      const tableId = Number(body.tableId);
      const [table] = await db.select().from(diningTables).where(eq(diningTables.id, tableId)).limit(1);
      if (!table) throw new Error("ไม่พบโต๊ะ");
      const [existing] = await db.select().from(orders).where(and(eq(orders.tableId, tableId), inArray(orders.status, ["open", "sent", "preparing", "ready", "served"]))).limit(1);
      if (existing) return NextResponse.json({ ok: true, orderId: existing.id });
      const orderId = id("ord");
      const orderNumber = `T${String(table.number).padStart(2, "0")}-${Date.now().toString().slice(-6)}`;
      await db.insert(orders).values({ id: orderId, orderNumber, tableId, openedBy: profile.id, status: "open", subtotal: 0, total: 0, openedAt: now, updatedAt: now });
      await db.update(diningTables).set({ status: "occupied" }).where(eq(diningTables.id, tableId));
      await log(profile.id, "OPEN_ORDER", `เปิดโต๊ะ ${table.number} (${orderNumber})`);
      return NextResponse.json({ ok: true, orderId });
    }

    if (action === "voidOrder") {
      if (!managementRoles.has(profile.role)) throw new Error("เฉพาะอาจารย์หรือผู้จัดการเท่านั้น");
      const approver = await requireManagerApproval(body.approvalUsername, body.approvalPassword);
      const orderId = String(body.orderId ?? "");
      const reason = requiredText(body.reason, "เหตุผลการยกเลิก", 300);
      const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), inArray(orders.status, [...activeOrderStatuses]))).limit(1);
      if (!order) throw new Error("ไม่พบบิลที่ยกเลิกได้");
      await db.update(orderItems).set({ status: "void" }).where(eq(orderItems.orderId, orderId));
      await db.update(orders).set({ status: "void", updatedAt: now, closedAt: now }).where(eq(orders.id, orderId));
      await db.update(diningTables).set({ status: "available" }).where(eq(diningTables.id, order.tableId));
      await db.update(serviceRequests).set({ status: "resolved", resolvedAt: now, resolvedBy: profile.id }).where(and(eq(serviceRequests.orderId, orderId), ne(serviceRequests.status, "resolved")));
      await db.update(guestVisits).set({ status: "cancelled", updatedAt: now }).where(and(eq(guestVisits.orderId, orderId), eq(guestVisits.status, "seated")));
      await log(profile.id, "VOID_ORDER", `ยกเลิกบิล ${order.orderNumber} • โต๊ะ ${order.tableId} • ยอด ${(order.total / 100).toFixed(2)} บาท • อนุมัติโดย ${approver.name} • เหตุผล: ${reason}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "moveOrder") {
      if (!canOperateTables) throw new Error("หน้าที่ในกะนี้ไม่มีสิทธิ์ย้ายโต๊ะ");
      const orderId = String(body.orderId ?? "");
      const targetTableId = Number(body.targetTableId);
      const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), inArray(orders.status, [...activeOrderStatuses]))).limit(1);
      const [target] = await db.select().from(diningTables).where(eq(diningTables.id, targetTableId)).limit(1);
      if (!order || !target) throw new Error("ไม่พบออเดอร์หรือโต๊ะปลายทาง");
      if (order.tableId === targetTableId) throw new Error("ออเดอร์อยู่ที่โต๊ะนี้แล้ว");
      const [occupied] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.tableId, targetTableId), inArray(orders.status, [...activeOrderStatuses]))).limit(1);
      if (occupied) throw new Error("โต๊ะปลายทางมีออเดอร์อยู่แล้ว กรุณาใช้รวมโต๊ะ");
      await db.update(orders).set({ tableId: targetTableId, updatedAt: now }).where(eq(orders.id, orderId));
      await db.update(diningTables).set({ status: "available" }).where(eq(diningTables.id, order.tableId));
      await db.update(diningTables).set({ status: "occupied" }).where(eq(diningTables.id, targetTableId));
      await db.update(serviceRequests).set({ tableId: targetTableId }).where(and(eq(serviceRequests.orderId, orderId), ne(serviceRequests.status, "resolved")));
      await db.update(guestVisits).set({ tableId: targetTableId, updatedAt: now }).where(eq(guestVisits.orderId, orderId));
      await log(profile.id, "MOVE_TABLE", `${order.orderNumber}: โต๊ะ ${order.tableId} → ${target.number}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "mergeOrder") {
      if (!canOperateTables) throw new Error("หน้าที่ในกะนี้ไม่มีสิทธิ์รวมโต๊ะ");
      const sourceOrderId = String(body.orderId ?? "");
      const targetTableId = Number(body.targetTableId);
      const [source] = await db.select().from(orders).where(and(eq(orders.id, sourceOrderId), inArray(orders.status, [...activeOrderStatuses]))).limit(1);
      const [target] = await db.select().from(orders).where(and(eq(orders.tableId, targetTableId), inArray(orders.status, [...activeOrderStatuses]))).limit(1);
      if (!source || !target || source.id === target.id) throw new Error("ต้องเลือกโต๊ะที่มีออเดอร์อื่นสำหรับรวมโต๊ะ");
      await db.update(orderItems).set({ orderId: target.id }).where(eq(orderItems.orderId, source.id));
      await db.update(serviceRequests).set({ orderId: target.id, tableId: targetTableId }).where(and(eq(serviceRequests.orderId, source.id), ne(serviceRequests.status, "resolved")));
      await db.update(guestVisits).set({ orderId: target.id, tableId: targetTableId, updatedAt: now }).where(eq(guestVisits.orderId, source.id));
      await db.update(orders).set({ status: "void", updatedAt: now, closedAt: now }).where(eq(orders.id, source.id));
      await db.update(diningTables).set({ status: "available" }).where(eq(diningTables.id, source.tableId));
      await recalculateOrder(target.id, now);
      await log(profile.id, "MERGE_TABLE", `${source.orderNumber} รวมเข้า ${target.orderNumber}`);
      return NextResponse.json({ ok: true, orderId: target.id });
    }

    if (action === "splitOrder") {
      if (!canOperateTables) throw new Error("หน้าที่ในกะนี้ไม่มีสิทธิ์แยกบิล");
      const sourceOrderId = String(body.orderId ?? "");
      const targetTableId = Number(body.targetTableId);
      const itemIds = Array.isArray(body.itemIds) ? body.itemIds.map(String) : [];
      if (!itemIds.length) throw new Error("กรุณาเลือกรายการที่ต้องการแยก");
      const [source] = await db.select().from(orders).where(and(eq(orders.id, sourceOrderId), inArray(orders.status, [...activeOrderStatuses]))).limit(1);
      const [targetTable] = await db.select().from(diningTables).where(eq(diningTables.id, targetTableId)).limit(1);
      if (!source || !targetTable || source.tableId === targetTableId) throw new Error("โต๊ะปลายทางไม่ถูกต้อง");
      const [occupied] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.tableId, targetTableId), inArray(orders.status, [...activeOrderStatuses]))).limit(1);
      if (occupied) throw new Error("โต๊ะปลายทางมีออเดอร์อยู่แล้ว");
      const selected = await db.select().from(orderItems).where(and(eq(orderItems.orderId, sourceOrderId), inArray(orderItems.id, itemIds)));
      if (!selected.length || selected.some((item) => item.status !== "draft")) throw new Error("แยกได้เฉพาะรายการที่ยังไม่ส่งเข้าครัว");
      const newOrderId = id("ord");
      const newOrderNumber = `T${String(targetTable.number).padStart(2, "0")}-${Date.now().toString().slice(-6)}`;
      await db.insert(orders).values({ id: newOrderId, orderNumber: newOrderNumber, tableId: targetTableId, openedBy: profile.id, status: "open", subtotal: 0, total: 0, openedAt: now, updatedAt: now });
      await db.update(orderItems).set({ orderId: newOrderId }).where(inArray(orderItems.id, selected.map((item) => item.id)));
      await db.update(diningTables).set({ status: "occupied" }).where(eq(diningTables.id, targetTableId));
      await recalculateOrder(sourceOrderId, now);
      await recalculateOrder(newOrderId, now);
      await log(profile.id, "SPLIT_ORDER", `${source.orderNumber} แยก ${selected.length} รายการไป ${newOrderNumber}`);
      return NextResponse.json({ ok: true, orderId: newOrderId });
    }

    if (action === "addItem") {
      if (!canOperateTables) throw new Error("หน้าที่ในกะนี้ไม่มีสิทธิ์รับออเดอร์");
      const orderId = String(body.orderId);
      const menuItemId = Number(body.menuItemId);
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      const [menu] = await db.select().from(menuItems).where(eq(menuItems.id, menuItemId)).limit(1);
      if (!order || !menu || !menu.active || !menu.available || order.status === "paid") throw new Error("เมนูนี้ปิดขายหรือหมดชั่วคราว");
      const optionSummary = String(body.optionSummary ?? "").trim().slice(0, 160);
      const note = String(body.note ?? "").trim().slice(0, 300);
      const optionPrice = Math.max(0, Math.round(Number(body.optionPrice ?? 0) * 100));
      if (!Number.isFinite(optionPrice) || optionPrice > 100_000) throw new Error("ราคาเพิ่มไม่ถูกต้อง");
      const [existing] = !optionSummary && !note && !optionPrice ? await db.select().from(orderItems).where(and(eq(orderItems.orderId, orderId), eq(orderItems.menuItemId, menuItemId), eq(orderItems.status, "draft"), eq(orderItems.optionSummary, ""), eq(orderItems.note, ""))).limit(1) : [];
      if (existing) await db.update(orderItems).set({ quantity: Math.min(20, existing.quantity + 1) }).where(eq(orderItems.id, existing.id));
      else await db.insert(orderItems).values({ id: id("item"), orderId, menuItemId, name: menu.name, unitPrice: menu.price, optionSummary, optionPrice, note, quantity: 1, status: "draft" });
      await recalculateOrder(orderId, now);
      await log(profile.id, "ADD_ORDER_ITEM", `${order.orderNumber} • เพิ่ม ${menu.name}${existing ? ` จำนวน ${existing.quantity} → ${Math.min(20, existing.quantity + 1)}` : " จำนวน 1"}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "updateItemDetails") {
      if (!canOperateTables) throw new Error("หน้าที่ในกะนี้ไม่มีสิทธิ์แก้รายการ");
      const orderId = String(body.orderId ?? "");
      const itemId = String(body.itemId ?? "");
      const [item] = await db.select().from(orderItems).where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId))).limit(1);
      if (!item || item.status !== "draft") throw new Error("แก้รายละเอียดได้เฉพาะรายการที่ยังไม่ส่งครัว");
      const optionSummary = String(body.optionSummary ?? "").trim().slice(0, 160);
      const note = String(body.note ?? "").trim().slice(0, 300);
      const optionPrice = Math.max(0, Math.round(Number(body.optionPrice ?? 0) * 100));
      if (!Number.isFinite(optionPrice) || optionPrice > 100_000) throw new Error("ราคาเพิ่มไม่ถูกต้อง");
      await db.update(orderItems).set({ optionSummary, optionPrice, note }).where(eq(orderItems.id, itemId));
      await recalculateOrder(orderId, now);
      const changes = [
        item.optionSummary !== optionSummary ? `ตัวเลือก “${item.optionSummary || "-"}” → “${optionSummary || "-"}”` : "",
        item.optionPrice !== optionPrice ? `ราคาเพิ่ม ${(item.optionPrice / 100).toFixed(2)} → ${(optionPrice / 100).toFixed(2)} บาท` : "",
        item.note !== note ? `หมายเหตุ “${item.note || "-"}” → “${note || "-"}”` : "",
      ].filter(Boolean).join(" • ");
      if (changes) await log(profile.id, "UPDATE_ORDER_ITEM", `${orderId} • ${item.name} • ${changes}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "setItemQuantity") {
      if (!canOperateTables) throw new Error("หน้าที่ในกะนี้ไม่มีสิทธิ์แก้จำนวนรายการ");
      const orderId = String(body.orderId);
      const itemId = String(body.itemId);
      const quantity = Number(body.quantity);
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > 20) throw new Error("จำนวนไม่ถูกต้อง");
      const [item] = await db.select().from(orderItems).where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId))).limit(1);
      if (!item || item.status !== "draft") throw new Error("รายการนี้ส่งเข้าครัวแล้ว ไม่สามารถแก้ไขจำนวนได้");
      if (quantity === 0) await db.delete(orderItems).where(eq(orderItems.id, itemId));
      else await db.update(orderItems).set({ quantity }).where(eq(orderItems.id, itemId));
      await recalculateOrder(orderId, now);
      await log(profile.id, quantity === 0 ? "DELETE_ORDER_ITEM" : "ORDER_ITEM_QUANTITY", quantity === 0
        ? `${orderId} • ลบ ${item.name} จำนวน ${item.quantity}`
        : `${orderId} • ${item.name} จำนวน ${item.quantity} → ${quantity}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "updateOrderCharges") {
      if (!canReceivePayment) throw new Error("หน้าที่ในกะนี้ไม่มีสิทธิ์แก้ส่วนลดและค่าบริการ");
      const orderId = String(body.orderId ?? "");
      const discountType = String(body.discountType ?? "none") as "none" | "percent" | "amount";
      if (!["none", "percent", "amount"].includes(discountType)) throw new Error("รูปแบบส่วนลดไม่ถูกต้อง");
      const rawDiscount = Number(body.discountValue ?? 0);
      if (!Number.isFinite(rawDiscount) || rawDiscount < 0 || (discountType === "percent" && rawDiscount > 100)) throw new Error("ส่วนลดไม่ถูกต้อง");
      const discountValue = discountType === "percent" ? Math.round(rawDiscount * 100) : discountType === "amount" ? Math.round(rawDiscount * 100) : 0;
      const serviceChargeRate = parseRate(body.serviceChargeRate, "ค่าบริการ");
      const vatRate = parseRate(body.vatRate, "VAT");
      const amounts = await recalculateOrder(orderId, now, { discountType, discountValue, serviceChargeRate, vatRate });
      await log(profile.id, "ORDER_CHARGES", `${orderId}: ลด ${amounts.discountAmount / 100} Service ${serviceChargeRate / 100}% VAT ${vatRate / 100}%`);
      return NextResponse.json({ ok: true });
    }

    if (action === "sendKitchen") {
      if (!canOperateTables) throw new Error("หน้าที่ในกะนี้ไม่มีสิทธิ์ส่งรายการเข้าจุดผลิต");
      const orderId = String(body.orderId);
      const draft = await db.select({ id: orderItems.id }).from(orderItems).where(and(eq(orderItems.orderId, orderId), eq(orderItems.status, "draft")));
      if (!draft.length) throw new Error("ไม่มีรายการใหม่สำหรับส่งครัว");
      await db.update(orderItems).set({ status: "sent" }).where(and(eq(orderItems.orderId, orderId), eq(orderItems.status, "draft")));
      await db.update(orders).set({ status: "sent", updatedAt: now }).where(eq(orders.id, orderId));
      await queueKitchenPrintBatch(orderId, draft.map((item) => item.id), profile.id, now);
      await log(profile.id, "SEND_KITCHEN", `ส่งออเดอร์ ${orderId} เข้าครัว`);
      return NextResponse.json({ ok: true });
    }

    if (action === "setOrderStatus") {
      const status = String(body.status) as "preparing" | "ready" | "served";
      if (!managementRoles.has(profile.role) || !["preparing", "ready", "served"].includes(status)) throw new Error("ไม่มีสิทธิ์เปลี่ยนสถานะ");
      const orderId = String(body.orderId);
      await db.update(orders).set({ status, updatedAt: now }).where(eq(orders.id, orderId));
      await db.update(orderItems).set({ status }).where(and(eq(orderItems.orderId, orderId), ne(orderItems.status, "void")));
      await log(profile.id, "ORDER_STATUS", `${orderId} → ${status}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "setDepartmentStatus") {
      const status = String(body.status) as "preparing" | "ready" | "served";
      if (!["preparing", "ready", "served"].includes(status)) throw new Error("สถานะจุดผลิตไม่ถูกต้อง");
      const orderId = String(body.orderId ?? "");
      const departments = Array.from(new Set((Array.isArray(body.departments) ? body.departments : []).map((value) => String(value ?? "").trim()).filter(Boolean))).slice(0, 10);
      if (!departments.length || departments.some((department) => department.length > 80)) throw new Error("จุดผลิตไม่ถูกต้อง");
      if (!isManagement && departments.some((department) => department === "บาร์เครื่องดื่ม" ? !canHandleBar : !canHandleKitchen)) throw new Error("หน้าที่ในกะนี้ไม่มีสิทธิ์เปลี่ยนสถานะจุดผลิตนี้");
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order || !activeOrderStatuses.includes(order.status as typeof activeOrderStatuses[number])) throw new Error("ออเดอร์นี้ไม่ได้อยู่ในสถานะที่ผลิตได้");
      const rows = await loadDepartmentItems(orderId);
      const previousStatus = status === "preparing" ? "sent" : status === "ready" ? "preparing" : "ready";
      const targetIds = rows.filter((row) => departments.includes(row.department) && row.status === previousStatus).map((row) => row.id);
      if (!targetIds.length) throw new Error("ไม่มีรายการในจุดผลิตที่พร้อมเปลี่ยนเป็นสถานะนี้");
      await db.update(orderItems).set({ status }).where(inArray(orderItems.id, targetIds));

      const updatedRows = rows.map((row) => targetIds.includes(row.id) ? { ...row, status } : row)
        .filter((row) => !["draft", "void"].includes(row.status));
      const orderStatus: "sent" | "preparing" | "ready" | "served" = updatedRows.length && updatedRows.every((row) => row.status === "served")
        ? "served"
        : updatedRows.length && updatedRows.every((row) => ["ready", "served"].includes(row.status))
          ? "ready"
          : updatedRows.some((row) => ["preparing", "ready", "served"].includes(row.status))
            ? "preparing"
            : "sent";
      await db.update(orders).set({ status: orderStatus, updatedAt: now }).where(eq(orders.id, orderId));
      await log(profile.id, "DEPARTMENT_STATUS", `${orderId} • ${departments.join(", ")} • ${targetIds.length} รายการ → ${status}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "settleOrder") {
      if (!canReceivePayment) throw new Error("หน้าที่ในกะนี้ไม่มีสิทธิ์รับชำระเงิน");
      if (body.confirmed !== true) throw new Error("กรุณายืนยันว่าได้รับเงินจริงแล้ว");
      const orderId = String(body.orderId);
      await recalculateOrder(orderId, now);
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order) throw new Error("ไม่พบออเดอร์");
      const [existingPayment] = await db.select({ id: orderPayments.id }).from(orderPayments).where(eq(orderPayments.orderId, orderId)).limit(1);
      if (order.status === "paid" || existingPayment) throw new Error("ออเดอร์นี้มีรายการรับชำระแล้ว ไม่สามารถปิดบิลซ้ำได้");
      if (order.total <= 0) throw new Error("ยอดชำระต้องมากกว่า 0");
      const paymentReference = String(body.paymentReference ?? "").trim();
      const confirmationNote = String(body.confirmationNote ?? "").trim();
      if (paymentReference.length > 80) throw new Error("เลขอ้างอิงต้องไม่เกิน 80 ตัวอักษร");
      if (confirmationNote.length > 200) throw new Error("หมายเหตุการรับชำระต้องไม่เกิน 200 ตัวอักษร");
      const rawPayments = Array.isArray(body.payments) ? body.payments : [{ method: body.method ?? "cash", amount: order.total / 100 }];
      const payments = rawPayments.map((raw) => {
        const row = raw as Record<string, unknown>;
        const method = String(row.method ?? "cash") as "cash" | "qr";
        if (!["cash", "qr"].includes(method)) throw new Error("ระบบรับเฉพาะเงินสดหรือพร้อมเพย์");
        const amount = Math.round(Number(row.amount ?? 0) * 100);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error("จำนวนเงินชำระไม่ถูกต้อง");
        return { method, amount };
      });
      if (payments.length !== 1) throw new Error("กรุณาเลือกชำระด้วยเงินสดหรือพร้อมเพย์เพียงช่องทางเดียว");
      if (payments.reduce((sum, row) => sum + row.amount, 0) !== order.total) throw new Error("ยอดชำระรวมต้องเท่ากับยอดสุทธิ");
      if (payments[0].method === "qr") {
        const [promptPaySetting] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, "promptpay_id")).limit(1);
        if (!promptPaySetting || ![10, 13].includes(promptPaySetting.value.replace(/\D/g, "").length)) throw new Error("กรุณาตั้งค่าหมายเลขพร้อมเพย์ก่อนรับชำระ");
        if (paymentReference.length < 4) throw new Error("กรุณากรอกเลขอ้างอิงจากรายการพร้อมเพย์อย่างน้อย 4 ตัว");
      }
      const usesCash = payments.some((row) => row.method === "cash");
      const [shift] = await db.select().from(cashShifts).where(eq(cashShifts.status, "open")).limit(1);
      if (!shift) throw new Error("กรุณาเปิดกะก่อนรับชำระเงินทุกช่องทาง");
      const cashAmount = payments.filter((row) => row.method === "cash").reduce((sum, row) => sum + row.amount, 0);
      const amountTendered = usesCash ? Math.round(Number(body.amountTendered ?? cashAmount / 100) * 100) : order.total;
      if (!Number.isFinite(amountTendered) || amountTendered < cashAmount) throw new Error("เงินสดที่รับมาต้องไม่น้อยกว่ายอดเงินสด");
      const changeAmount = usesCash ? amountTendered - cashAmount : 0;
      const soldItems = await db.select().from(orderItems).where(and(eq(orderItems.orderId, orderId), ne(orderItems.status, "void")));
      const menuIds = Array.from(new Set(soldItems.map((item) => item.menuItemId)));
      const recipes = menuIds.length ? await db.select().from(menuRecipes).where(inArray(menuRecipes.menuItemId, menuIds)) : [];
      const required = new Map<string, number>();
      for (const soldItem of soldItems) {
        for (const recipe of recipes.filter((row) => row.menuItemId === soldItem.menuItemId)) {
          required.set(recipe.inventoryItemId, (required.get(recipe.inventoryItemId) ?? 0) + recipe.quantity * soldItem.quantity);
        }
      }
      const inventoryIds = Array.from(required.keys());
      const stockRows = inventoryIds.length ? await db.select().from(inventoryItems).where(inArray(inventoryItems.id, inventoryIds)) : [];
      const insufficient = stockRows.filter((item) => item.currentStock < (required.get(item.id) ?? 0));
      if (insufficient.length) throw new Error(`สต๊อกไม่พอ: ${insufficient.map((item) => item.name).join(", ")}`);
      for (const item of stockRows) {
        const used = required.get(item.id) ?? 0;
        if (!used) continue;
        await db.update(inventoryItems).set({ currentStock: item.currentStock - used, updatedAt: now }).where(eq(inventoryItems.id, item.id));
        await db.insert(stockMovements).values({ id: id("move"), inventoryItemId: item.id, type: "sale", quantityDelta: -used, referenceId: orderId, note: order.orderNumber, actorId: profile.id, createdAt: now });
      }
      const receipt = receiptNumber(now);
      await db.insert(orderPayments).values(payments.map((payment) => ({
        id: id("pay"),
        orderId,
        shiftId: shift.id,
        method: payment.method,
        amount: payment.amount,
        status: "confirmed" as const,
        referenceCode: paymentReference || receipt,
        confirmationNote,
        receivedBy: profile.id,
        createdAt: now,
      })));
      await db.update(orders).set({
        status: "paid",
        paymentMethod: payments.map((row) => row.method).join("+"),
        amountTendered,
        changeAmount,
        receiptNumber: receipt,
        paidBy: profile.id,
        shiftId: shift.id,
        updatedAt: now,
        closedAt: now,
      }).where(eq(orders.id, orderId));
      await db.update(diningTables).set({ status: "available" }).where(eq(diningTables.id, order.tableId));
      await db.update(guestVisits).set({ status: "completed", updatedAt: now }).where(and(eq(guestVisits.orderId, orderId), eq(guestVisits.status, "seated")));
      await db.update(serviceRequests).set({ status: "resolved", resolvedAt: now, resolvedBy: profile.id }).where(and(eq(serviceRequests.orderId, orderId), ne(serviceRequests.status, "resolved")));
      await log(profile.id, "PAYMENT", `ยืนยันรับชำระ ${order.orderNumber} ${(order.total / 100).toFixed(2)} บาท (${payments.map((row) => row.method).join("+")}) • อ้างอิง ${paymentReference || receipt} • ใบเสร็จ ${receipt}`);
      return NextResponse.json({ ok: true, receiptNumber: receipt, changeAmount, paymentReference: paymentReference || receipt, receivedByName: profile.name });
    }

    if (action === "refundPayment") {
      if (!paymentRoles.has(profile.role)) throw new Error("ไม่มีสิทธิ์ทำรายการคืนเงิน");
      const approver = await requireManagerApproval(body.approvalUsername, body.approvalPassword);
      const orderId = String(body.orderId ?? "");
      const reason = requiredText(body.reason, "เหตุผลการคืนเงิน", 300);
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order || order.status !== "paid") throw new Error("บิลนี้ไม่ได้อยู่ในสถานะที่คืนเงินได้");
      const payments = await db.select().from(orderPayments).where(eq(orderPayments.orderId, orderId));
      if (!payments.length || payments.some((payment) => payment.status !== "confirmed")) throw new Error("รายการนี้ถูกคืนเงินหรือยกเลิกไปแล้ว");
      const [shift] = order.shiftId ? await db.select().from(cashShifts).where(eq(cashShifts.id, order.shiftId)).limit(1) : [];
      if (!shift || shift.status !== "open") throw new Error("คืนเงินได้เฉพาะบิลในกะที่ยังเปิดอยู่ เพื่อป้องกันรายงานปิดกะคลาดเคลื่อน");
      await db.update(orderPayments).set({ status: "refunded", reversedBy: approver.id, reversedAt: now, reversalReason: reason }).where(eq(orderPayments.orderId, orderId));
      await db.update(orders).set({ status: "refunded", updatedAt: now }).where(eq(orders.id, orderId));
      await log(profile.id, "REFUND_PAYMENT", `คืนเงิน ${order.orderNumber} ${(order.total / 100).toFixed(2)} บาท • ทำรายการโดย ${profile.name} • อนุมัติโดย ${approver.name} • เหตุผล: ${reason} • ไม่คืนสต๊อกอัตโนมัติ`);
      return NextResponse.json({ ok: true });
    }

    if (action === "setRole") {
      if (profile.role !== "instructor") throw new Error("เฉพาะอาจารย์เท่านั้น");
      const targetId = String(body.userId);
      const role = String(body.role) as "manager" | "cashier" | "student";
      if (!["manager", "cashier", "student"].includes(role)) throw new Error("บทบาทไม่ถูกต้อง");
      if (targetId === profile.id) throw new Error("เปลี่ยนบทบาทของตนเองไม่ได้");
      await db.update(users).set({ role }).where(eq(users.id, targetId));
      await log(profile.id, "SET_ROLE", `${targetId} → ${role}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "createUser") {
      if (profile.role !== "instructor") throw new Error("เฉพาะอาจารย์เท่านั้น");
      const username = normalizeUsername(String(body.username ?? ""));
      const password = String(body.password ?? "");
      const name = String(body.name ?? "").trim();
      const role = String(body.role ?? "student") as "manager" | "cashier" | "student";
      if (!validUsername(username)) throw new Error("ชื่อผู้ใช้ต้องมี 3–32 ตัว และใช้ a-z, 0-9, จุด ขีดกลาง หรือขีดล่าง");
      if (!validPassword(password)) throw new Error("รหัสผ่านต้องมี 10–128 ตัวอักษร");
      if (name.length < 2 || name.length > 80) throw new Error("กรุณาระบุชื่อ 2–80 ตัวอักษร");
      if (!["manager", "cashier", "student"].includes(role)) throw new Error("บทบาทไม่ถูกต้อง");
      const [existingAccount] = await db.select().from(authAccounts).where(eq(authAccounts.username, username)).limit(1);
      if (existingAccount) throw new Error("ชื่อผู้ใช้นี้มีอยู่แล้ว");
      const userId = `local:${crypto.randomUUID()}`;
      const passwordData = await createPasswordHash(password);
      await db.insert(users).values({
        id: userId,
        email: `${username}@local.pos`,
        name,
        role,
        active: true,
        lastSeenAt: now,
        createdAt: now,
      });
      try {
        await db.insert(authAccounts).values({
          userId,
          username,
          ...passwordData,
          failedAttempts: 0,
          createdAt: now,
          updatedAt: now,
        });
      } catch (cause) {
        await db.delete(users).where(eq(users.id, userId));
        throw cause;
      }
      await log(profile.id, "CREATE_USER", `สร้างบัญชี ${username} (${role})`);
      return NextResponse.json({ ok: true });
    }

    if (action === "resetPassword") {
      if (profile.role !== "instructor") throw new Error("เฉพาะอาจารย์เท่านั้น");
      const targetId = String(body.userId ?? "");
      const password = String(body.password ?? "");
      if (!validPassword(password)) throw new Error("รหัสผ่านต้องมี 10–128 ตัวอักษร");
      const [account] = await db.select().from(authAccounts).where(eq(authAccounts.userId, targetId)).limit(1);
      if (!account) throw new Error("ไม่พบบัญชีผู้ใช้");
      const passwordData = await createPasswordHash(password);
      await db.update(authAccounts).set({
        ...passwordData,
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: now,
      }).where(eq(authAccounts.userId, targetId));
      await db.delete(authSessions).where(eq(authSessions.userId, targetId));
      await log(profile.id, "RESET_PASSWORD", `รีเซ็ตรหัสผ่าน ${account.username}`);
      return NextResponse.json({ ok: true });
    }

    throw new Error("คำสั่งไม่ถูกต้อง");
  } catch (error) {
    if (/^[a-f0-9-]{20,64}$/i.test(clientRequestId)) await db.delete(actionRequests).where(eq(actionRequests.id, clientRequestId)).catch(() => undefined);
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาด";
    await log(profile.id, "ACTION_FAILED", `${action || "UNKNOWN_ACTION"} • ${message}`.slice(0, 500)).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
