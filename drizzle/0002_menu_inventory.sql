ALTER TABLE `menu_items` ADD `description` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `menu_items` ADD `available` integer DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE TABLE `menu_images` (
	`menu_item_id` integer PRIMARY KEY NOT NULL,
	`mime_type` text NOT NULL,
	`base64_data` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`unit` text NOT NULL,
	`current_stock` integer DEFAULT 0 NOT NULL,
	`minimum_stock` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_items_sku_unique` ON `inventory_items` (`sku`);
--> statement-breakpoint
CREATE TABLE `menu_recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`menu_item_id` integer NOT NULL,
	`inventory_item_id` text NOT NULL,
	`quantity` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `menu_recipes_pair_unique` ON `menu_recipes` (`menu_item_id`,`inventory_item_id`);
--> statement-breakpoint
CREATE TABLE `stock_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`document_number` text NOT NULL,
	`supplier` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`received_by` text NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_receipt_items` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_id` text NOT NULL,
	`inventory_item_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_cost` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`inventory_item_id` text NOT NULL,
	`type` text NOT NULL,
	`quantity_delta` integer NOT NULL,
	`reference_id` text,
	`note` text DEFAULT '' NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stock_movements_item_date_idx` ON `stock_movements` (`inventory_item_id`,`created_at`);
