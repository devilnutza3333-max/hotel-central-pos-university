import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../db";
import { auditLogs, users } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

type BackupTable = { name: string; columns: string[] };

const backupTables: BackupTable[] = [
  { name: "duty_shifts", columns: ["id", "label", "service_date", "status", "opened_by", "opened_at", "closed_by", "closed_at"] },
  { name: "duty_assignments", columns: ["id", "duty_shift_id", "user_id", "station", "status", "assigned_by", "assigned_at", "checked_in_at", "checked_out_at"] },
  { name: "dining_tables", columns: ["id", "number", "zone", "seats", "public_token", "status"] },
  { name: "guest_visits", columns: ["id", "visit_type", "customer_name", "phone", "room_number", "guest_count", "scheduled_at", "note", "status", "table_id", "order_id", "created_by", "created_at", "updated_at", "seated_at", "seated_by"] },
  { name: "readiness_runs", columns: ["id", "status", "score", "results", "actor_id", "created_at"] },
  { name: "opening_closing_runs", columns: ["id", "service_date", "run_type", "status", "checks", "note", "approved_by", "approved_at", "created_at"] },
  { name: "service_requests", columns: ["id", "table_id", "order_id", "type", "status", "note", "created_at", "acknowledged_at", "acknowledged_by", "resolved_at", "resolved_by"] },
  { name: "menu_items", columns: ["id", "name", "category", "price", "description", "available", "active"] },
  { name: "inventory_items", columns: ["id", "sku", "name", "unit", "current_stock", "minimum_stock", "active", "created_at", "updated_at"] },
  { name: "stock_count_sessions", columns: ["id", "service_date", "status", "note", "created_by", "created_at", "updated_at", "submitted_by", "submitted_at", "approved_by", "approved_at"] },
  { name: "stock_count_lines", columns: ["id", "session_id", "inventory_item_id", "snapshot_stock", "counted_stock", "difference", "reason", "counted_by", "counted_at"] },
  { name: "menu_recipes", columns: ["id", "menu_item_id", "inventory_item_id", "quantity"] },
  { name: "stock_receipts", columns: ["id", "document_number", "supplier", "note", "received_by", "received_at"] },
  { name: "stock_receipt_items", columns: ["id", "receipt_id", "inventory_item_id", "quantity", "unit_cost"] },
  { name: "stock_movements", columns: ["id", "inventory_item_id", "type", "quantity_delta", "reference_id", "note", "actor_id", "created_at"] },
  { name: "delivery_orders", columns: ["id", "order_number", "customer_name", "phone", "building", "delivery_point", "note", "campus_confirmed", "status", "tracking_token", "rider_id", "subtotal", "total", "created_at", "updated_at", "confirmed_at", "picked_up_at", "near_arrival_at", "delivered_at"] },
  { name: "delivery_order_items", columns: ["id", "order_id", "menu_item_id", "name", "unit_price", "quantity"] },
  { name: "app_settings", columns: ["key", "value", "updated_at", "updated_by"] },
  { name: "orders", columns: ["id", "order_number", "table_id", "status", "opened_by", "subtotal", "discount_type", "discount_value", "discount_amount", "service_charge_rate", "service_charge_amount", "vat_rate", "vat_amount", "total", "payment_method", "amount_tendered", "change_amount", "receipt_number", "paid_by", "shift_id", "opened_at", "updated_at", "closed_at"] },
  { name: "order_items", columns: ["id", "order_id", "menu_item_id", "name", "unit_price", "option_summary", "option_price", "note", "quantity", "status"] },
  { name: "cash_shifts", columns: ["id", "opened_by", "opening_cash", "status", "opened_at", "closed_by", "closed_at", "expected_cash", "closing_cash", "difference", "note"] },
  { name: "cash_movements", columns: ["id", "shift_id", "type", "amount", "note", "actor_id", "created_at"] },
  { name: "order_payments", columns: ["id", "order_id", "shift_id", "method", "amount", "status", "reference_code", "confirmation_note", "received_by", "created_at", "reversed_by", "reversed_at", "reversal_reason"] },
  { name: "print_jobs", columns: ["id", "order_id", "document_type", "department", "copy_number", "printed_by", "printed_at", "reprint_reason"] },
  { name: "print_queue_jobs", columns: ["id", "order_id", "department", "item_ids", "status", "attempts", "last_error", "created_by", "handled_by", "created_at", "updated_at", "completed_at"] },
  { name: "audit_logs", columns: ["id", "actor_id", "action", "detail", "created_at"] },
];

const deleteOrder = [
  "duty_assignments", "service_requests", "guest_visits", "opening_closing_runs", "readiness_runs", "menu_recipes", "stock_count_lines", "stock_receipt_items", "stock_movements",
  "delivery_order_items", "order_items", "order_payments", "print_queue_jobs", "print_jobs", "cash_movements", "audit_logs",
  "stock_count_sessions", "stock_receipts", "delivery_orders", "orders", "cash_shifts", "duty_shifts", "app_settings", "inventory_items",
  "menu_items", "dining_tables",
];

type BackupPayload = {
  format: "pbru-hotel-central-pos";
  version: 1;
  createdAt: string;
  createdBy: { id: string; name: string };
  excludes: string[];
  tables: Record<string, Array<Record<string, unknown>>>;
};

const restoreDefaults: Record<string, Record<string, unknown>> = {
  order_payments: {
    status: "confirmed",
    reference_code: "",
    confirmation_note: "",
    reversal_reason: "",
  },
};

async function authorizedProfile() {
  const auth = await getChatGPTUser();
  if (!auth) return null;
  const [profile] = await getDb().select().from(users).where(eq(users.id, auth.userId)).limit(1);
  return profile?.active ? profile : null;
}

function isBackupPayload(value: unknown): value is BackupPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<BackupPayload>;
  if (payload.format !== "pbru-hotel-central-pos" || payload.version !== 1 || !payload.tables || typeof payload.tables !== "object") return false;
  return backupTables.every((table) => ["print_jobs", "print_queue_jobs", "duty_shifts", "duty_assignments", "guest_visits", "readiness_runs", "opening_closing_runs", "stock_count_sessions", "stock_count_lines"].includes(table.name) || Array.isArray(payload.tables?.[table.name]));
}

export async function GET(request: Request) {
  const profile = await authorizedProfile();
  if (!profile || !["instructor", "manager"].includes(profile.role)) {
    return NextResponse.json({ error: "เฉพาะอาจารย์หรือผู้จัดการเท่านั้น" }, { status: 403 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get("mode") === "summary") {
    return NextResponse.json({
      timeTravel: { enabled: true, retentionDays: 7, provider: "Cloudflare D1" },
      manualExport: true,
      restoreAllowed: profile.role === "instructor",
      excludes: ["รหัสผ่าน", "เซสชันเข้าสู่ระบบ", "ไฟล์รูปเมนู (ยังคงเก็บใน D1 Time Travel)"],
    });
  }

  const database = env.DB;
  if (!database) return NextResponse.json({ error: "ไม่พบฐานข้อมูลกลาง" }, { status: 503 });
  const tables: BackupPayload["tables"] = {};
  for (const table of backupTables) {
    const result = await database.prepare(`SELECT ${table.columns.map((column) => `\"${column}\"`).join(", ")} FROM \"${table.name}\"`).all();
    tables[table.name] = (result.results ?? []) as Array<Record<string, unknown>>;
  }
  const createdAt = new Date();
  const payload: BackupPayload = {
    format: "pbru-hotel-central-pos",
    version: 1,
    createdAt: createdAt.toISOString(),
    createdBy: { id: profile.id, name: profile.name },
    excludes: ["auth_accounts", "auth_sessions", "action_requests", "menu_images"],
    tables,
  };
  await getDb().insert(auditLogs).values({
    id: `log_${crypto.randomUUID()}`,
    actorId: profile.id,
    action: "EXPORT_BACKUP",
    detail: `ดาวน์โหลดไฟล์สำรอง ${createdAt.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`,
    createdAt,
  });
  const fileDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(createdAt).replace(/[^0-9]/g, "");
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename=hotel-central-pos-backup-${fileDate}.json`,
      "cache-control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const profile = await authorizedProfile();
  if (!profile || profile.role !== "instructor") {
    return NextResponse.json({ error: "เฉพาะอาจารย์ผู้ควบคุมเท่านั้นที่กู้คืนข้อมูลได้" }, { status: 403 });
  }

  try {
    const database = env.DB;
    if (!database) throw new Error("ไม่พบฐานข้อมูลกลาง");
    const body = await request.json() as { confirmation?: string; backup?: unknown };
    if (body.confirmation !== "กู้คืนข้อมูล") throw new Error("กรุณาพิมพ์คำยืนยันให้ถูกต้อง");
    if (!isBackupPayload(body.backup)) throw new Error("ไฟล์สำรองไม่ถูกต้องหรือเป็นคนละรุ่น");
    const backup = body.backup;
    const totalRows = backupTables.reduce((sum, table) => sum + (backup.tables[table.name] ?? []).length, 0);
    if (totalRows > 50_000) throw new Error("ไฟล์สำรองมีจำนวนรายการมากเกินขีดจำกัด");

    const statements: D1PreparedStatement[] = deleteOrder.map((table) => database.prepare(`DELETE FROM \"${table}\"`));
    for (const table of backupTables) {
      for (const row of backup.tables[table.name] ?? []) {
        const values = table.columns.map((column) => row[column] ?? restoreDefaults[table.name]?.[column] ?? null);
        const placeholders = table.columns.map(() => "?").join(", ");
        const columns = table.columns.map((column) => `\"${column}\"`).join(", ");
        statements.push(database.prepare(`INSERT INTO \"${table.name}\" (${columns}) VALUES (${placeholders})`).bind(...values));
      }
    }
    await database.batch(statements);
    await getDb().insert(auditLogs).values({
      id: `log_${crypto.randomUUID()}`,
      actorId: profile.id,
      action: "RESTORE_BACKUP",
      detail: `กู้คืนข้อมูลจากไฟล์วันที่ ${backup.createdAt} จำนวน ${totalRows.toLocaleString("th-TH")} รายการ`,
      createdAt: new Date(),
    });
    return NextResponse.json({ ok: true, restoredRows: totalRows, backupCreatedAt: backup.createdAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "กู้คืนข้อมูลไม่สำเร็จ" }, { status: 400 });
  }
}
