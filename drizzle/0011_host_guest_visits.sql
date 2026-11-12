CREATE TABLE `guest_visits` (
  `id` text PRIMARY KEY NOT NULL,
  `visit_type` text NOT NULL,
  `customer_name` text NOT NULL,
  `phone` text DEFAULT '' NOT NULL,
  `room_number` text DEFAULT '' NOT NULL,
  `guest_count` integer DEFAULT 1 NOT NULL,
  `scheduled_at` integer,
  `note` text DEFAULT '' NOT NULL,
  `status` text NOT NULL,
  `table_id` integer,
  `order_id` text,
  `created_by` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `seated_at` integer,
  `seated_by` text
);

CREATE INDEX `guest_visits_status_schedule_idx` ON `guest_visits` (`status`,`scheduled_at`);
CREATE INDEX `guest_visits_table_idx` ON `guest_visits` (`table_id`);
