ALTER TABLE `order_payments` ADD `status` text DEFAULT 'confirmed' NOT NULL;
--> statement-breakpoint
ALTER TABLE `order_payments` ADD `reference_code` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `order_payments` ADD `confirmation_note` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `order_payments` ADD `reversed_by` text;
--> statement-breakpoint
ALTER TABLE `order_payments` ADD `reversed_at` integer;
--> statement-breakpoint
ALTER TABLE `order_payments` ADD `reversal_reason` text DEFAULT '' NOT NULL;
