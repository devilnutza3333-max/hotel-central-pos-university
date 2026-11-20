/**
 * One-time Cloudflare D1 initialization for the new empty Hotel Central POS database.
 * This temporarily bridges initial deployment without an account-wide API token.
 * Remove the caller from worker/index.ts as soon as deployment is verified.
 * Migration SQL below is copied verbatim from drizzle/0000..0015 in this repository.
 * Never run this against a D1 database containing application tables.
 */
const migrations = [
  {
    "name": "0000_far_steve_rogers.sql",
    "sql": "CREATE TABLE `audit_logs` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`actor_id` text NOT NULL,\n\t`action` text NOT NULL,\n\t`detail` text NOT NULL,\n\t`created_at` integer NOT NULL\n);\n\n\nCREATE TABLE `dining_tables` (\n\t`id` integer PRIMARY KEY NOT NULL,\n\t`number` integer NOT NULL,\n\t`zone` text NOT NULL,\n\t`seats` integer DEFAULT 4 NOT NULL,\n\t`status` text DEFAULT 'available' NOT NULL\n);\n\n\nCREATE UNIQUE INDEX `dining_tables_number_unique` ON `dining_tables` (`number`);\n\nCREATE TABLE `menu_items` (\n\t`id` integer PRIMARY KEY NOT NULL,\n\t`name` text NOT NULL,\n\t`category` text NOT NULL,\n\t`price` integer NOT NULL,\n\t`active` integer DEFAULT true NOT NULL\n);\n\n\nCREATE TABLE `order_items` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`order_id` text NOT NULL,\n\t`menu_item_id` integer NOT NULL,\n\t`name` text NOT NULL,\n\t`unit_price` integer NOT NULL,\n\t`quantity` integer DEFAULT 1 NOT NULL,\n\t`status` text DEFAULT 'draft' NOT NULL\n);\n\n\nCREATE TABLE `orders` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`order_number` text NOT NULL,\n\t`table_id` integer NOT NULL,\n\t`status` text DEFAULT 'open' NOT NULL,\n\t`opened_by` text NOT NULL,\n\t`subtotal` integer DEFAULT 0 NOT NULL,\n\t`total` integer DEFAULT 0 NOT NULL,\n\t`payment_method` text,\n\t`opened_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\t`closed_at` integer\n);\n\n\nCREATE UNIQUE INDEX `orders_order_number_unique` ON `orders` (`order_number`);\n\nCREATE TABLE `users` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`email` text NOT NULL,\n\t`name` text NOT NULL,\n\t`role` text DEFAULT 'student' NOT NULL,\n\t`active` integer DEFAULT true NOT NULL,\n\t`last_seen_at` integer NOT NULL,\n\t`created_at` integer NOT NULL\n);\n"
  },
  {
    "name": "0001_local_auth.sql",
    "sql": "CREATE TABLE `auth_accounts` (\n\t`user_id` text PRIMARY KEY NOT NULL,\n\t`username` text NOT NULL,\n\t`password_hash` text NOT NULL,\n\t`password_salt` text NOT NULL,\n\t`password_iterations` integer DEFAULT 100000 NOT NULL,\n\t`failed_attempts` integer DEFAULT 0 NOT NULL,\n\t`locked_until` integer,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL\n);\n\n\nCREATE UNIQUE INDEX `auth_accounts_username_unique` ON `auth_accounts` (`username`);\n\n\nCREATE TABLE `auth_sessions` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`user_id` text NOT NULL,\n\t`expires_at` integer NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`last_seen_at` integer NOT NULL\n);\n\n\nCREATE INDEX `auth_sessions_user_id_idx` ON `auth_sessions` (`user_id`);\n\n\nCREATE INDEX `auth_sessions_expires_at_idx` ON `auth_sessions` (`expires_at`);\n"
  },
  {
    "name": "0002_menu_inventory.sql",
    "sql": "ALTER TABLE `menu_items` ADD `description` text DEFAULT '' NOT NULL;\n\n\nALTER TABLE `menu_items` ADD `available` integer DEFAULT true NOT NULL;\n\n\nCREATE TABLE `menu_images` (\n\t`menu_item_id` integer PRIMARY KEY NOT NULL,\n\t`mime_type` text NOT NULL,\n\t`base64_data` text NOT NULL,\n\t`updated_at` integer NOT NULL\n);\n\n\nCREATE TABLE `inventory_items` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`sku` text NOT NULL,\n\t`name` text NOT NULL,\n\t`unit` text NOT NULL,\n\t`current_stock` integer DEFAULT 0 NOT NULL,\n\t`minimum_stock` integer DEFAULT 0 NOT NULL,\n\t`active` integer DEFAULT true NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL\n);\n\n\nCREATE UNIQUE INDEX `inventory_items_sku_unique` ON `inventory_items` (`sku`);\n\n\nCREATE TABLE `menu_recipes` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`menu_item_id` integer NOT NULL,\n\t`inventory_item_id` text NOT NULL,\n\t`quantity` integer NOT NULL\n);\n\n\nCREATE UNIQUE INDEX `menu_recipes_pair_unique` ON `menu_recipes` (`menu_item_id`,`inventory_item_id`);\n\n\nCREATE TABLE `stock_receipts` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`document_number` text NOT NULL,\n\t`supplier` text NOT NULL,\n\t`note` text DEFAULT '' NOT NULL,\n\t`received_by` text NOT NULL,\n\t`received_at` integer NOT NULL\n);\n\n\nCREATE TABLE `stock_receipt_items` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`receipt_id` text NOT NULL,\n\t`inventory_item_id` text NOT NULL,\n\t`quantity` integer NOT NULL,\n\t`unit_cost` integer DEFAULT 0 NOT NULL\n);\n\n\nCREATE TABLE `stock_movements` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`inventory_item_id` text NOT NULL,\n\t`type` text NOT NULL,\n\t`quantity_delta` integer NOT NULL,\n\t`reference_id` text,\n\t`note` text DEFAULT '' NOT NULL,\n\t`actor_id` text NOT NULL,\n\t`created_at` integer NOT NULL\n);\n\n\nCREATE INDEX `stock_movements_item_date_idx` ON `stock_movements` (`inventory_item_id`,`created_at`);\n"
  },
  {
    "name": "0003_campus_delivery.sql",
    "sql": "CREATE TABLE `delivery_orders` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`order_number` text NOT NULL,\n\t`customer_name` text NOT NULL,\n\t`phone` text NOT NULL,\n\t`building` text NOT NULL,\n\t`delivery_point` text NOT NULL,\n\t`note` text DEFAULT '' NOT NULL,\n\t`campus_confirmed` integer DEFAULT false NOT NULL,\n\t`status` text DEFAULT 'pending' NOT NULL,\n\t`subtotal` integer DEFAULT 0 NOT NULL,\n\t`total` integer DEFAULT 0 NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\t`confirmed_at` integer,\n\t`delivered_at` integer\n);\n\n\nCREATE UNIQUE INDEX `delivery_orders_order_number_unique` ON `delivery_orders` (`order_number`);\n\n\nCREATE INDEX `delivery_orders_status_date_idx` ON `delivery_orders` (`status`,`created_at`);\n\n\nCREATE TABLE `delivery_order_items` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`order_id` text NOT NULL,\n\t`menu_item_id` integer NOT NULL,\n\t`name` text NOT NULL,\n\t`unit_price` integer NOT NULL,\n\t`quantity` integer DEFAULT 1 NOT NULL\n);\n\n\nCREATE INDEX `delivery_order_items_order_idx` ON `delivery_order_items` (`order_id`);\n\n\nCREATE TABLE `app_settings` (\n\t`key` text PRIMARY KEY NOT NULL,\n\t`value` text NOT NULL,\n\t`updated_at` integer NOT NULL,\n\t`updated_by` text NOT NULL\n);\n"
  },
  {
    "name": "0004_table_self_order.sql",
    "sql": "ALTER TABLE `dining_tables` ADD `public_token` text;\n\n\nCREATE UNIQUE INDEX `dining_tables_public_token_unique` ON `dining_tables` (`public_token`);\n\n\nUPDATE `dining_tables` SET `public_token` = lower(hex(randomblob(16))) WHERE `public_token` IS NULL;\n\n\nCREATE TABLE `service_requests` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`table_id` integer NOT NULL,\n\t`order_id` text,\n\t`type` text NOT NULL,\n\t`status` text DEFAULT 'open' NOT NULL,\n\t`note` text DEFAULT '' NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`acknowledged_at` integer,\n\t`acknowledged_by` text,\n\t`resolved_at` integer,\n\t`resolved_by` text\n);\n\n\nCREATE INDEX `service_requests_status_date_idx` ON `service_requests` (`status`,`created_at`);\n\n\nCREATE INDEX `service_requests_table_idx` ON `service_requests` (`table_id`);\n"
  },
  {
    "name": "0005_delivery_tracking.sql",
    "sql": "ALTER TABLE `delivery_orders` ADD `tracking_token` text;\n\n\nALTER TABLE `delivery_orders` ADD `rider_id` text;\n\n\nALTER TABLE `delivery_orders` ADD `picked_up_at` integer;\n\n\nALTER TABLE `delivery_orders` ADD `near_arrival_at` integer;\n\n\nUPDATE `delivery_orders` SET `tracking_token` = lower(hex(randomblob(24))) WHERE `tracking_token` IS NULL;\n\n\nCREATE UNIQUE INDEX `delivery_orders_tracking_token_unique` ON `delivery_orders` (`tracking_token`);\n\n\nCREATE INDEX `delivery_orders_rider_status_idx` ON `delivery_orders` (`rider_id`,`status`);\n"
  },
  {
    "name": "0006_pos_opening_v1.sql",
    "sql": "ALTER TABLE `orders` ADD `discount_type` text DEFAULT 'none' NOT NULL;\n\n\nALTER TABLE `orders` ADD `discount_value` integer DEFAULT 0 NOT NULL;\n\n\nALTER TABLE `orders` ADD `discount_amount` integer DEFAULT 0 NOT NULL;\n\n\nALTER TABLE `orders` ADD `service_charge_rate` integer DEFAULT 0 NOT NULL;\n\n\nALTER TABLE `orders` ADD `service_charge_amount` integer DEFAULT 0 NOT NULL;\n\n\nALTER TABLE `orders` ADD `vat_rate` integer DEFAULT 0 NOT NULL;\n\n\nALTER TABLE `orders` ADD `vat_amount` integer DEFAULT 0 NOT NULL;\n\n\nALTER TABLE `orders` ADD `amount_tendered` integer DEFAULT 0 NOT NULL;\n\n\nALTER TABLE `orders` ADD `change_amount` integer DEFAULT 0 NOT NULL;\n\n\nALTER TABLE `orders` ADD `receipt_number` text;\n\n\nCREATE UNIQUE INDEX `orders_receipt_number_unique` ON `orders` (`receipt_number`);\n\n\nALTER TABLE `orders` ADD `paid_by` text;\n\n\nALTER TABLE `orders` ADD `shift_id` text;\n\n\nALTER TABLE `order_items` ADD `option_summary` text DEFAULT '' NOT NULL;\n\n\nALTER TABLE `order_items` ADD `option_price` integer DEFAULT 0 NOT NULL;\n\n\nALTER TABLE `order_items` ADD `note` text DEFAULT '' NOT NULL;\n\n\nCREATE TABLE `cash_shifts` (\n  `id` text PRIMARY KEY NOT NULL,\n  `opened_by` text NOT NULL,\n  `opening_cash` integer DEFAULT 0 NOT NULL,\n  `status` text DEFAULT 'open' NOT NULL,\n  `opened_at` integer NOT NULL,\n  `closed_by` text,\n  `closed_at` integer,\n  `expected_cash` integer DEFAULT 0 NOT NULL,\n  `closing_cash` integer DEFAULT 0 NOT NULL,\n  `difference` integer DEFAULT 0 NOT NULL,\n  `note` text DEFAULT '' NOT NULL\n);\n\n\nCREATE INDEX `cash_shifts_status_date_idx` ON `cash_shifts` (`status`,`opened_at`);\n\n\nCREATE TABLE `cash_movements` (\n  `id` text PRIMARY KEY NOT NULL,\n  `shift_id` text NOT NULL,\n  `type` text NOT NULL,\n  `amount` integer NOT NULL,\n  `note` text NOT NULL,\n  `actor_id` text NOT NULL,\n  `created_at` integer NOT NULL\n);\n\n\nCREATE INDEX `cash_movements_shift_date_idx` ON `cash_movements` (`shift_id`,`created_at`);\n\n\nCREATE TABLE `order_payments` (\n  `id` text PRIMARY KEY NOT NULL,\n  `order_id` text NOT NULL,\n  `shift_id` text,\n  `method` text NOT NULL,\n  `amount` integer NOT NULL,\n  `received_by` text NOT NULL,\n  `created_at` integer NOT NULL\n);\n\n\nCREATE INDEX `order_payments_order_idx` ON `order_payments` (`order_id`);\n\n\nCREATE TABLE `action_requests` (\n  `id` text PRIMARY KEY NOT NULL,\n  `actor_id` text NOT NULL,\n  `action` text NOT NULL,\n  `created_at` integer NOT NULL\n);\n\n\nCREATE INDEX `action_requests_created_idx` ON `action_requests` (`created_at`);\n"
  },
  {
    "name": "0007_payment_control.sql",
    "sql": "ALTER TABLE `order_payments` ADD `status` text DEFAULT 'confirmed' NOT NULL;\n\n\nALTER TABLE `order_payments` ADD `reference_code` text DEFAULT '' NOT NULL;\n\n\nALTER TABLE `order_payments` ADD `confirmation_note` text DEFAULT '' NOT NULL;\n\n\nALTER TABLE `order_payments` ADD `reversed_by` text;\n\n\nALTER TABLE `order_payments` ADD `reversed_at` integer;\n\n\nALTER TABLE `order_payments` ADD `reversal_reason` text DEFAULT '' NOT NULL;\n"
  },
  {
    "name": "0008_print_jobs.sql",
    "sql": "CREATE TABLE `print_jobs` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`order_id` text NOT NULL,\n\t`document_type` text NOT NULL,\n\t`department` text DEFAULT '' NOT NULL,\n\t`copy_number` integer DEFAULT 1 NOT NULL,\n\t`printed_by` text NOT NULL,\n\t`printed_at` integer NOT NULL,\n\t`reprint_reason` text DEFAULT '' NOT NULL\n);\n\n\nCREATE INDEX `print_jobs_order_idx` ON `print_jobs` (`order_id`);\n\n\nCREATE INDEX `print_jobs_date_idx` ON `print_jobs` (`printed_at`);\n"
  },
  {
    "name": "0009_auto_print_queue.sql",
    "sql": "CREATE TABLE `print_queue_jobs` (\n  `id` text PRIMARY KEY NOT NULL,\n  `order_id` text NOT NULL,\n  `department` text NOT NULL,\n  `item_ids` text NOT NULL,\n  `status` text DEFAULT 'pending' NOT NULL,\n  `attempts` integer DEFAULT 0 NOT NULL,\n  `last_error` text DEFAULT '' NOT NULL,\n  `created_by` text NOT NULL,\n  `handled_by` text,\n  `created_at` integer NOT NULL,\n  `updated_at` integer NOT NULL,\n  `completed_at` integer\n);\n\n\nCREATE INDEX `print_queue_status_date_idx` ON `print_queue_jobs` (`status`, `created_at`);\n\n\nCREATE INDEX `print_queue_order_idx` ON `print_queue_jobs` (`order_id`);\n"
  },
  {
    "name": "0010_staff_duty_shifts.sql",
    "sql": "CREATE TABLE `duty_shifts` (\n  `id` text PRIMARY KEY NOT NULL,\n  `label` text NOT NULL,\n  `service_date` text NOT NULL,\n  `status` text DEFAULT 'open' NOT NULL,\n  `opened_by` text NOT NULL,\n  `opened_at` integer NOT NULL,\n  `closed_by` text,\n  `closed_at` integer\n);\n\n\nCREATE INDEX `duty_shifts_status_date_idx` ON `duty_shifts` (`status`,`service_date`);\n\n\nCREATE TABLE `duty_assignments` (\n  `id` text PRIMARY KEY NOT NULL,\n  `duty_shift_id` text NOT NULL,\n  `user_id` text NOT NULL,\n  `station` text NOT NULL,\n  `status` text DEFAULT 'assigned' NOT NULL,\n  `assigned_by` text NOT NULL,\n  `assigned_at` integer NOT NULL,\n  `checked_in_at` integer,\n  `checked_out_at` integer\n);\n\n\nCREATE UNIQUE INDEX `duty_assignments_shift_user_unique` ON `duty_assignments` (`duty_shift_id`,`user_id`);\n\n\nCREATE INDEX `duty_assignments_shift_station_idx` ON `duty_assignments` (`duty_shift_id`,`station`);\n"
  },
  {
    "name": "0011_host_guest_visits.sql",
    "sql": "CREATE TABLE `guest_visits` (\n  `id` text PRIMARY KEY NOT NULL,\n  `visit_type` text NOT NULL,\n  `customer_name` text NOT NULL,\n  `phone` text DEFAULT '' NOT NULL,\n  `room_number` text DEFAULT '' NOT NULL,\n  `guest_count` integer DEFAULT 1 NOT NULL,\n  `scheduled_at` integer,\n  `note` text DEFAULT '' NOT NULL,\n  `status` text NOT NULL,\n  `table_id` integer,\n  `order_id` text,\n  `created_by` text NOT NULL,\n  `created_at` integer NOT NULL,\n  `updated_at` integer NOT NULL,\n  `seated_at` integer,\n  `seated_by` text\n);\n\nCREATE INDEX `guest_visits_status_schedule_idx` ON `guest_visits` (`status`,`scheduled_at`);\nCREATE INDEX `guest_visits_table_idx` ON `guest_visits` (`table_id`);\n"
  },
  {
    "name": "0012_readiness_runs.sql",
    "sql": "CREATE TABLE `readiness_runs` (\n  `id` text PRIMARY KEY NOT NULL,\n  `status` text NOT NULL,\n  `score` integer DEFAULT 0 NOT NULL,\n  `results` text NOT NULL,\n  `actor_id` text NOT NULL,\n  `created_at` integer NOT NULL\n);\n\nCREATE INDEX `readiness_runs_created_idx` ON `readiness_runs` (`created_at`);\n"
  },
  {
    "name": "0013_opening_closing_runs.sql",
    "sql": "CREATE TABLE `opening_closing_runs` (\n  `id` text PRIMARY KEY NOT NULL,\n  `service_date` text NOT NULL,\n  `run_type` text NOT NULL,\n  `status` text DEFAULT 'completed' NOT NULL,\n  `checks` text NOT NULL,\n  `note` text DEFAULT '' NOT NULL,\n  `approved_by` text NOT NULL,\n  `approved_at` integer NOT NULL,\n  `created_at` integer NOT NULL\n);\n\nCREATE UNIQUE INDEX `opening_closing_runs_date_type_unique`\n  ON `opening_closing_runs` (`service_date`, `run_type`);\n\nCREATE INDEX `opening_closing_runs_approved_idx`\n  ON `opening_closing_runs` (`approved_at`);\n"
  },
  {
    "name": "0014_stock_counts.sql",
    "sql": "CREATE TABLE `stock_count_sessions` (\n  `id` text PRIMARY KEY NOT NULL,\n  `service_date` text NOT NULL,\n  `status` text DEFAULT 'draft' NOT NULL,\n  `note` text DEFAULT '' NOT NULL,\n  `created_by` text NOT NULL,\n  `created_at` integer NOT NULL,\n  `updated_at` integer NOT NULL,\n  `submitted_by` text,\n  `submitted_at` integer,\n  `approved_by` text,\n  `approved_at` integer\n);\n\nCREATE UNIQUE INDEX `stock_count_sessions_date_unique`\n  ON `stock_count_sessions` (`service_date`);\n\nCREATE INDEX `stock_count_sessions_status_date_idx`\n  ON `stock_count_sessions` (`status`, `service_date`);\n\nCREATE TABLE `stock_count_lines` (\n  `id` text PRIMARY KEY NOT NULL,\n  `session_id` text NOT NULL,\n  `inventory_item_id` text NOT NULL,\n  `snapshot_stock` integer NOT NULL,\n  `counted_stock` integer,\n  `difference` integer DEFAULT 0 NOT NULL,\n  `reason` text DEFAULT '' NOT NULL,\n  `counted_by` text,\n  `counted_at` integer\n);\n\nCREATE UNIQUE INDEX `stock_count_lines_session_item_unique`\n  ON `stock_count_lines` (`session_id`, `inventory_item_id`);\n\nCREATE INDEX `stock_count_lines_session_idx`\n  ON `stock_count_lines` (`session_id`);\n\nCREATE INDEX `stock_count_lines_item_idx`\n  ON `stock_count_lines` (`inventory_item_id`);\n"
  },
  {
    "name": "0015_delivery_perf_indexes.sql",
    "sql": "-- Delivery read-path optimization for 200 orders per day.\n-- Safe, additive indexes; no deletes, no resets and no changes to existing rows.\n-- Include status ready_for_pickup in the per-phone active-order limit at API layer.\nCREATE INDEX IF NOT EXISTS delivery_orders_phone_status_idx\n  ON delivery_orders (phone, status);\n\n\nCREATE INDEX IF NOT EXISTS delivery_orders_recent_idx\n  ON delivery_orders (created_at DESC, id DESC);\n"
  }
] as const;

const requiredTables = ["users", "auth_accounts", "auth_sessions", "menu_items", "orders", "order_items", "delivery_orders", "delivery_order_items", "dining_tables", "app_settings", "stock_count_lines"];

export async function initializeEmptyPosDatabase(db: D1Database): Promise<void> {
  // Only bootstrap a completely blank POS database. Never migrate existing sales.
  const before = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '_cf_KV' ORDER BY name"
  ).all<{name: string}>();
  const existing = new Set((before.results ?? []).map((row) => row.name));
  if (requiredTables.every((name) => existing.has(name))) return;
  if (existing.size !== 0) {
    throw new Error("POS_SCHEMA_PARTIAL_OR_EXISTING: Refusing to alter existing database.");
  }

  await db.exec(
    "CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);"
  );
  for (const migration of migrations) {
    // SQL is from committed migration files; the filename contains no user input.
    const sql = migration.sql.trim() + "\nINSERT INTO d1_migrations (name) VALUES ('" + migration.name + "');";
    await db.exec(sql);
  }

  const after = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
  ).all<{name: string}>();
  const present = new Set((after.results ?? []).map((row) => row.name));
  for (const name of requiredTables) {
    if (!present.has(name)) throw new Error("Missing POS table after installation: " + name);
  }

  // An initial manager with a strong randomly generated password, never stored in GitHub.
  // Only its PBKDF2 hash and salt are present in source. User receives the password privately.
  const now = Math.floor(Date.now() / 1000);
  const uid = "pos_mgr_cb5d4d0b40dadedb79c21010";
  await db.batch([
    db.prepare(
      "INSERT INTO users (id, email, name, role, active, last_seen_at, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)"
    ).bind(uid, "Devilnutza3333@gmail.com", "Hotel Central POS Manager", "manager", now, now),
    db.prepare(
      "INSERT INTO auth_accounts (user_id, username, password_hash, password_salt, password_iterations, failed_attempts, created_at, updated_at) VALUES (?, ?, ?, ?, 100000, 0, ?, ?)"
    ).bind(uid, "manager", "c5Z22IHWY087ETiZRnriPLmevhkO4ns6InNfhCXChPw", "KmITGuBLgWD0Jall0DQ3pQ", now, now),
  ]);
}