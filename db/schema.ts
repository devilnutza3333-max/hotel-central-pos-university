import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role", { enum: ["instructor", "manager", "cashier", "student"] })
    .notNull()
    .default("student"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const authAccounts = sqliteTable("auth_accounts", {
  userId: text("user_id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordIterations: integer("password_iterations").notNull().default(100000),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: integer("locked_until", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).notNull(),
});

export const dutyShifts = sqliteTable("duty_shifts", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  serviceDate: text("service_date").notNull(),
  status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
  openedBy: text("opened_by").notNull(),
  openedAt: integer("opened_at", { mode: "timestamp" }).notNull(),
  closedBy: text("closed_by"),
  closedAt: integer("closed_at", { mode: "timestamp" }),
}, (table) => [index("duty_shifts_status_date_idx").on(table.status, table.serviceDate)]);

export const dutyAssignments = sqliteTable("duty_assignments", {
  id: text("id").primaryKey(),
  dutyShiftId: text("duty_shift_id").notNull(),
  userId: text("user_id").notNull(),
  station: text("station", { enum: ["host", "service", "kitchen", "bar", "cashier_trainee", "delivery"] }).notNull(),
  status: text("status", { enum: ["assigned", "checked_in", "checked_out"] }).notNull().default("assigned"),
  assignedBy: text("assigned_by").notNull(),
  assignedAt: integer("assigned_at", { mode: "timestamp" }).notNull(),
  checkedInAt: integer("checked_in_at", { mode: "timestamp" }),
  checkedOutAt: integer("checked_out_at", { mode: "timestamp" }),
}, (table) => [
  uniqueIndex("duty_assignments_shift_user_unique").on(table.dutyShiftId, table.userId),
  index("duty_assignments_shift_station_idx").on(table.dutyShiftId, table.station),
]);

export const diningTables = sqliteTable("dining_tables", {
  id: integer("id").primaryKey(),
  number: integer("number").notNull().unique(),
  zone: text("zone").notNull(),
  seats: integer("seats").notNull().default(4),
  publicToken: text("public_token"),
  status: text("status", { enum: ["available", "occupied", "cleaning"] })
    .notNull()
    .default("available"),
});

export const guestVisits = sqliteTable("guest_visits", {
  id: text("id").primaryKey(),
  visitType: text("visit_type", { enum: ["walk_in", "reservation"] }).notNull(),
  customerName: text("customer_name").notNull(),
  phone: text("phone").notNull().default(""),
  roomNumber: text("room_number").notNull().default(""),
  guestCount: integer("guest_count").notNull().default(1),
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
  note: text("note").notNull().default(""),
  status: text("status", { enum: ["reserved", "waiting", "seated", "cancelled", "no_show", "completed"] }).notNull(),
  tableId: integer("table_id"),
  orderId: text("order_id"),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  seatedAt: integer("seated_at", { mode: "timestamp" }),
  seatedBy: text("seated_by"),
}, (table) => [
  index("guest_visits_status_schedule_idx").on(table.status, table.scheduledAt),
  index("guest_visits_table_idx").on(table.tableId),
]);

export const readinessRuns = sqliteTable("readiness_runs", {
  id: text("id").primaryKey(),
  status: text("status", { enum: ["pass", "warning", "fail"] }).notNull(),
  score: integer("score").notNull().default(0),
  results: text("results").notNull(),
  actorId: text("actor_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [index("readiness_runs_created_idx").on(table.createdAt)]);

export const openingClosingRuns = sqliteTable("opening_closing_runs", {
  id: text("id").primaryKey(),
  serviceDate: text("service_date").notNull(),
  runType: text("run_type", { enum: ["opening", "closing"] }).notNull(),
  status: text("status", { enum: ["completed"] }).notNull().default("completed"),
  checks: text("checks").notNull(),
  note: text("note").notNull().default(""),
  approvedBy: text("approved_by").notNull(),
  approvedAt: integer("approved_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  uniqueIndex("opening_closing_runs_date_type_unique").on(table.serviceDate, table.runType),
  index("opening_closing_runs_approved_idx").on(table.approvedAt),
]);

export const serviceRequests = sqliteTable("service_requests", {
  id: text("id").primaryKey(),
  tableId: integer("table_id").notNull(),
  orderId: text("order_id"),
  type: text("type", { enum: ["waiter", "bill", "seated"] }).notNull(),
  status: text("status", { enum: ["open", "acknowledged", "resolved"] }).notNull().default("open"),
  note: text("note").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  acknowledgedAt: integer("acknowledged_at", { mode: "timestamp" }),
  acknowledgedBy: text("acknowledged_by"),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  resolvedBy: text("resolved_by"),
});

export const menuItems = sqliteTable("menu_items", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  price: integer("price").notNull(),
  description: text("description").notNull().default(""),
  available: integer("available", { mode: "boolean" }).notNull().default(true),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const menuImages = sqliteTable("menu_images", {
  menuItemId: integer("menu_item_id").primaryKey(),
  mimeType: text("mime_type").notNull(),
  base64Data: text("base64_data").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const inventoryItems = sqliteTable("inventory_items", {
  id: text("id").primaryKey(),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  unit: text("unit", { enum: ["kg", "liter", "unit", "pack"] }).notNull(),
  currentStock: integer("current_stock").notNull().default(0),
  minimumStock: integer("minimum_stock").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => [uniqueIndex("inventory_items_sku_unique").on(table.sku)]);

export const menuRecipes = sqliteTable("menu_recipes", {
  id: text("id").primaryKey(),
  menuItemId: integer("menu_item_id").notNull(),
  inventoryItemId: text("inventory_item_id").notNull(),
  quantity: integer("quantity").notNull(),
}, (table) => [uniqueIndex("menu_recipes_pair_unique").on(table.menuItemId, table.inventoryItemId)]);

export const stockReceipts = sqliteTable("stock_receipts", {
  id: text("id").primaryKey(),
  documentNumber: text("document_number").notNull(),
  supplier: text("supplier").notNull(),
  note: text("note").notNull().default(""),
  receivedBy: text("received_by").notNull(),
  receivedAt: integer("received_at", { mode: "timestamp" }).notNull(),
});

export const stockReceiptItems = sqliteTable("stock_receipt_items", {
  id: text("id").primaryKey(),
  receiptId: text("receipt_id").notNull(),
  inventoryItemId: text("inventory_item_id").notNull(),
  quantity: integer("quantity").notNull(),
  unitCost: integer("unit_cost").notNull().default(0),
});

export const stockMovements = sqliteTable("stock_movements", {
  id: text("id").primaryKey(),
  inventoryItemId: text("inventory_item_id").notNull(),
  type: text("type", { enum: ["receive", "adjust", "sale", "return"] }).notNull(),
  quantityDelta: integer("quantity_delta").notNull(),
  referenceId: text("reference_id"),
  note: text("note").notNull().default(""),
  actorId: text("actor_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [index("stock_movements_item_date_idx").on(table.inventoryItemId, table.createdAt)]);

export const stockCountSessions = sqliteTable("stock_count_sessions", {
  id: text("id").primaryKey(),
  serviceDate: text("service_date").notNull(),
  status: text("status", { enum: ["draft", "submitted", "approved"] }).notNull().default("draft"),
  note: text("note").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  submittedBy: text("submitted_by"),
  submittedAt: integer("submitted_at", { mode: "timestamp" }),
  approvedBy: text("approved_by"),
  approvedAt: integer("approved_at", { mode: "timestamp" }),
}, (table) => [
  uniqueIndex("stock_count_sessions_date_unique").on(table.serviceDate),
  index("stock_count_sessions_status_date_idx").on(table.status, table.serviceDate),
]);

export const stockCountLines = sqliteTable("stock_count_lines", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  inventoryItemId: text("inventory_item_id").notNull(),
  snapshotStock: integer("snapshot_stock").notNull(),
  countedStock: integer("counted_stock"),
  difference: integer("difference").notNull().default(0),
  reason: text("reason").notNull().default(""),
  countedBy: text("counted_by"),
  countedAt: integer("counted_at", { mode: "timestamp" }),
}, (table) => [
  uniqueIndex("stock_count_lines_session_item_unique").on(table.sessionId, table.inventoryItemId),
  index("stock_count_lines_session_idx").on(table.sessionId),
  index("stock_count_lines_item_idx").on(table.inventoryItemId),
]);

export const deliveryOrders = sqliteTable("delivery_orders", {
  id: text("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  customerName: text("customer_name").notNull(),
  phone: text("phone").notNull(),
  building: text("building").notNull(),
  deliveryPoint: text("delivery_point").notNull(),
  note: text("note").notNull().default(""),
  campusConfirmed: integer("campus_confirmed", { mode: "boolean" }).notNull().default(false),
  status: text("status", { enum: ["pending", "confirmed", "preparing", "out_for_delivery", "near_arrival", "delivered", "cancelled"] }).notNull().default("pending"),
  trackingToken: text("tracking_token").unique(),
  riderId: text("rider_id"),
  subtotal: integer("subtotal").notNull().default(0),
  total: integer("total").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  confirmedAt: integer("confirmed_at", { mode: "timestamp" }),
  pickedUpAt: integer("picked_up_at", { mode: "timestamp" }),
  nearArrivalAt: integer("near_arrival_at", { mode: "timestamp" }),
  deliveredAt: integer("delivered_at", { mode: "timestamp" }),
});

export const deliveryOrderItems = sqliteTable("delivery_order_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  menuItemId: integer("menu_item_id").notNull(),
  name: text("name").notNull(),
  unitPrice: integer("unit_price").notNull(),
  quantity: integer("quantity").notNull().default(1),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  updatedBy: text("updated_by").notNull(),
});

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  tableId: integer("table_id").notNull(),
  status: text("status", {
    enum: ["open", "sent", "preparing", "ready", "served", "paid", "refunded", "void"],
  })
    .notNull()
    .default("open"),
  openedBy: text("opened_by").notNull(),
  subtotal: integer("subtotal").notNull().default(0),
  discountType: text("discount_type", { enum: ["none", "percent", "amount"] }).notNull().default("none"),
  discountValue: integer("discount_value").notNull().default(0),
  discountAmount: integer("discount_amount").notNull().default(0),
  serviceChargeRate: integer("service_charge_rate").notNull().default(0),
  serviceChargeAmount: integer("service_charge_amount").notNull().default(0),
  vatRate: integer("vat_rate").notNull().default(0),
  vatAmount: integer("vat_amount").notNull().default(0),
  total: integer("total").notNull().default(0),
  paymentMethod: text("payment_method"),
  amountTendered: integer("amount_tendered").notNull().default(0),
  changeAmount: integer("change_amount").notNull().default(0),
  receiptNumber: text("receipt_number").unique(),
  paidBy: text("paid_by"),
  shiftId: text("shift_id"),
  openedAt: integer("opened_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  closedAt: integer("closed_at", { mode: "timestamp" }),
});

export const orderItems = sqliteTable("order_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  menuItemId: integer("menu_item_id").notNull(),
  name: text("name").notNull(),
  unitPrice: integer("unit_price").notNull(),
  optionSummary: text("option_summary").notNull().default(""),
  optionPrice: integer("option_price").notNull().default(0),
  note: text("note").notNull().default(""),
  quantity: integer("quantity").notNull().default(1),
  status: text("status", { enum: ["draft", "sent", "preparing", "ready", "served", "void"] })
    .notNull()
    .default("draft"),
});

export const cashShifts = sqliteTable("cash_shifts", {
  id: text("id").primaryKey(),
  openedBy: text("opened_by").notNull(),
  openingCash: integer("opening_cash").notNull().default(0),
  status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
  openedAt: integer("opened_at", { mode: "timestamp" }).notNull(),
  closedBy: text("closed_by"),
  closedAt: integer("closed_at", { mode: "timestamp" }),
  expectedCash: integer("expected_cash").notNull().default(0),
  closingCash: integer("closing_cash").notNull().default(0),
  difference: integer("difference").notNull().default(0),
  note: text("note").notNull().default(""),
}, (table) => [index("cash_shifts_status_date_idx").on(table.status, table.openedAt)]);

export const cashMovements = sqliteTable("cash_movements", {
  id: text("id").primaryKey(),
  shiftId: text("shift_id").notNull(),
  type: text("type", { enum: ["cash_in", "cash_out"] }).notNull(),
  amount: integer("amount").notNull(),
  note: text("note").notNull(),
  actorId: text("actor_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [index("cash_movements_shift_date_idx").on(table.shiftId, table.createdAt)]);

export const orderPayments = sqliteTable("order_payments", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  shiftId: text("shift_id"),
  method: text("method", { enum: ["cash", "qr", "card", "transfer"] }).notNull(),
  amount: integer("amount").notNull(),
  status: text("status", { enum: ["confirmed", "refunded"] }).notNull().default("confirmed"),
  referenceCode: text("reference_code").notNull().default(""),
  confirmationNote: text("confirmation_note").notNull().default(""),
  receivedBy: text("received_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  reversedBy: text("reversed_by"),
  reversedAt: integer("reversed_at", { mode: "timestamp" }),
  reversalReason: text("reversal_reason").notNull().default(""),
}, (table) => [index("order_payments_order_idx").on(table.orderId)]);

export const printJobs = sqliteTable("print_jobs", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  documentType: text("document_type", { enum: ["kitchen", "receipt"] }).notNull(),
  department: text("department").notNull().default(""),
  copyNumber: integer("copy_number").notNull().default(1),
  printedBy: text("printed_by").notNull(),
  printedAt: integer("printed_at", { mode: "timestamp" }).notNull(),
  reprintReason: text("reprint_reason").notNull().default(""),
}, (table) => [
  index("print_jobs_order_idx").on(table.orderId),
  index("print_jobs_date_idx").on(table.printedAt),
]);

export const printQueueJobs = sqliteTable("print_queue_jobs", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  department: text("department").notNull(),
  itemIds: text("item_ids").notNull(),
  status: text("status", { enum: ["pending", "processing", "printed", "failed"] }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error").notNull().default(""),
  createdBy: text("created_by").notNull(),
  handledBy: text("handled_by"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
}, (table) => [
  index("print_queue_status_date_idx").on(table.status, table.createdAt),
  index("print_queue_order_idx").on(table.orderId),
]);

export const actionRequests = sqliteTable("action_requests", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [index("action_requests_created_idx").on(table.createdAt)]);

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  detail: text("detail").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
