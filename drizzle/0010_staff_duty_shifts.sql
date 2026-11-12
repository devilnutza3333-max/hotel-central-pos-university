CREATE TABLE `duty_shifts` (
  `id` text PRIMARY KEY NOT NULL,
  `label` text NOT NULL,
  `service_date` text NOT NULL,
  `status` text DEFAULT 'open' NOT NULL,
  `opened_by` text NOT NULL,
  `opened_at` integer NOT NULL,
  `closed_by` text,
  `closed_at` integer
);
--> statement-breakpoint
CREATE INDEX `duty_shifts_status_date_idx` ON `duty_shifts` (`status`,`service_date`);
--> statement-breakpoint
CREATE TABLE `duty_assignments` (
  `id` text PRIMARY KEY NOT NULL,
  `duty_shift_id` text NOT NULL,
  `user_id` text NOT NULL,
  `station` text NOT NULL,
  `status` text DEFAULT 'assigned' NOT NULL,
  `assigned_by` text NOT NULL,
  `assigned_at` integer NOT NULL,
  `checked_in_at` integer,
  `checked_out_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `duty_assignments_shift_user_unique` ON `duty_assignments` (`duty_shift_id`,`user_id`);
--> statement-breakpoint
CREATE INDEX `duty_assignments_shift_station_idx` ON `duty_assignments` (`duty_shift_id`,`station`);
