CREATE TABLE `print_queue_jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `order_id` text NOT NULL,
  `department` text NOT NULL,
  `item_ids` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `attempts` integer DEFAULT 0 NOT NULL,
  `last_error` text DEFAULT '' NOT NULL,
  `created_by` text NOT NULL,
  `handled_by` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `print_queue_status_date_idx` ON `print_queue_jobs` (`status`, `created_at`);
--> statement-breakpoint
CREATE INDEX `print_queue_order_idx` ON `print_queue_jobs` (`order_id`);
