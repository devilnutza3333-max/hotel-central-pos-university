CREATE TABLE `delivery_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`customer_name` text NOT NULL,
	`phone` text NOT NULL,
	`building` text NOT NULL,
	`delivery_point` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`campus_confirmed` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`subtotal` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`confirmed_at` integer,
	`delivered_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_orders_order_number_unique` ON `delivery_orders` (`order_number`);
--> statement-breakpoint
CREATE INDEX `delivery_orders_status_date_idx` ON `delivery_orders` (`status`,`created_at`);
--> statement-breakpoint
CREATE TABLE `delivery_order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`menu_item_id` integer NOT NULL,
	`name` text NOT NULL,
	`unit_price` integer NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `delivery_order_items_order_idx` ON `delivery_order_items` (`order_id`);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL
);
