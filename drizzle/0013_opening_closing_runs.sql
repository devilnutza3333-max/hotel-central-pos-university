CREATE TABLE `opening_closing_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `service_date` text NOT NULL,
  `run_type` text NOT NULL,
  `status` text DEFAULT 'completed' NOT NULL,
  `checks` text NOT NULL,
  `note` text DEFAULT '' NOT NULL,
  `approved_by` text NOT NULL,
  `approved_at` integer NOT NULL,
  `created_at` integer NOT NULL
);

CREATE UNIQUE INDEX `opening_closing_runs_date_type_unique`
  ON `opening_closing_runs` (`service_date`, `run_type`);

CREATE INDEX `opening_closing_runs_approved_idx`
  ON `opening_closing_runs` (`approved_at`);
