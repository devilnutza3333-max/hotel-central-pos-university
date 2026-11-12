CREATE TABLE `stock_count_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `service_date` text NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `note` text DEFAULT '' NOT NULL,
  `created_by` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `submitted_by` text,
  `submitted_at` integer,
  `approved_by` text,
  `approved_at` integer
);

CREATE UNIQUE INDEX `stock_count_sessions_date_unique`
  ON `stock_count_sessions` (`service_date`);

CREATE INDEX `stock_count_sessions_status_date_idx`
  ON `stock_count_sessions` (`status`, `service_date`);

CREATE TABLE `stock_count_lines` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `inventory_item_id` text NOT NULL,
  `snapshot_stock` integer NOT NULL,
  `counted_stock` integer,
  `difference` integer DEFAULT 0 NOT NULL,
  `reason` text DEFAULT '' NOT NULL,
  `counted_by` text,
  `counted_at` integer
);

CREATE UNIQUE INDEX `stock_count_lines_session_item_unique`
  ON `stock_count_lines` (`session_id`, `inventory_item_id`);

CREATE INDEX `stock_count_lines_session_idx`
  ON `stock_count_lines` (`session_id`);

CREATE INDEX `stock_count_lines_item_idx`
  ON `stock_count_lines` (`inventory_item_id`);
