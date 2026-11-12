import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { appSettings, menuItems, orderItems, printQueueJobs } from "../db/schema";

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function defaultDepartment(category: string) {
  const normalized = category.toLowerCase();
  if (["เครื่องดื่ม", "กาแฟ", "ชา", "น้ำ", "drink", "coffee", "beverage"].some((word) => normalized.includes(word))) return "บาร์เครื่องดื่ม";
  if (["ของหวาน", "เบเกอรี่", "เค้ก", "dessert", "bakery"].some((word) => normalized.includes(word))) return "ของหวาน";
  return "ครัวร้อน";
}

export async function queueKitchenPrintBatch(orderId: string, itemIds: string[], createdBy: string, now: Date) {
  const uniqueItemIds = Array.from(new Set(itemIds.filter(Boolean)));
  if (!uniqueItemIds.length) return [];
  const db = getDb();
  const rows = await db.select({ id: orderItems.id, menuItemId: orderItems.menuItemId }).from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), inArray(orderItems.id, uniqueItemIds)));
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
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const category = categoryByMenuId.get(row.menuItemId) ?? "อาหาร";
    const department = mappings[category] || defaultDepartment(category);
    grouped.set(department, [...(grouped.get(department) ?? []), row.id]);
  }
  const jobs = Array.from(grouped.entries()).map(([department, groupedItemIds]) => ({
    id: id("queue"),
    orderId,
    department,
    itemIds: JSON.stringify(groupedItemIds),
    status: "pending" as const,
    attempts: 0,
    lastError: "",
    createdBy,
    handledBy: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  }));
  if (jobs.length) await db.insert(printQueueJobs).values(jobs);
  return jobs;
}
