CREATE TABLE `print_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`document_type` text NOT NULL,
	`department` text DEFAULT '' NOT NULL,
	`copy_number` integer DEFAULT 1 NOT NULL,
	`printed_by` text NOT NULL,
	`printed_at` integer NOT NULL,
	`reprint_reason` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `print_jobs_order_idx` ON `print_jobs` (`order_id`);
--> statement-breakpoint
CREATE INDEX `print_jobs_date_idx` ON `print_jobs` (`printed_at`);
