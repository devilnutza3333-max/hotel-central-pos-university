ALTER TABLE `dining_tables` ADD `public_token` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `dining_tables_public_token_unique` ON `dining_tables` (`public_token`);
--> statement-breakpoint
UPDATE `dining_tables` SET `public_token` = lower(hex(randomblob(16))) WHERE `public_token` IS NULL;
--> statement-breakpoint
CREATE TABLE `service_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`table_id` integer NOT NULL,
	`order_id` text,
	`type` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`acknowledged_at` integer,
	`acknowledged_by` text,
	`resolved_at` integer,
	`resolved_by` text
);
--> statement-breakpoint
CREATE INDEX `service_requests_status_date_idx` ON `service_requests` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `service_requests_table_idx` ON `service_requests` (`table_id`);
