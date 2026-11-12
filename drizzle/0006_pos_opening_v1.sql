ALTER TABLE `orders` ADD `discount_type` text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `discount_value` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `discount_amount` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `service_charge_rate` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `service_charge_amount` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `vat_rate` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `vat_amount` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `amount_tendered` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `change_amount` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `receipt_number` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_receipt_number_unique` ON `orders` (`receipt_number`);
--> statement-breakpoint
ALTER TABLE `orders` ADD `paid_by` text;
--> statement-breakpoint
ALTER TABLE `orders` ADD `shift_id` text;
--> statement-breakpoint
ALTER TABLE `order_items` ADD `option_summary` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `order_items` ADD `option_price` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `order_items` ADD `note` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TABLE `cash_shifts` (
  `id` text PRIMARY KEY NOT NULL,
  `opened_by` text NOT NULL,
  `opening_cash` integer DEFAULT 0 NOT NULL,
  `status` text DEFAULT 'open' NOT NULL,
  `opened_at` integer NOT NULL,
  `closed_by` text,
  `closed_at` integer,
  `expected_cash` integer DEFAULT 0 NOT NULL,
  `closing_cash` integer DEFAULT 0 NOT NULL,
  `difference` integer DEFAULT 0 NOT NULL,
  `note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cash_shifts_status_date_idx` ON `cash_shifts` (`status`,`opened_at`);
--> statement-breakpoint
CREATE TABLE `cash_movements` (
  `id` text PRIMARY KEY NOT NULL,
  `shift_id` text NOT NULL,
  `type` text NOT NULL,
  `amount` integer NOT NULL,
  `note` text NOT NULL,
  `actor_id` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cash_movements_shift_date_idx` ON `cash_movements` (`shift_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `order_payments` (
  `id` text PRIMARY KEY NOT NULL,
  `order_id` text NOT NULL,
  `shift_id` text,
  `method` text NOT NULL,
  `amount` integer NOT NULL,
  `received_by` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `order_payments_order_idx` ON `order_payments` (`order_id`);
--> statement-breakpoint
CREATE TABLE `action_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_id` text NOT NULL,
  `action` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `action_requests_created_idx` ON `action_requests` (`created_at`);
