CREATE TABLE `readiness_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `status` text NOT NULL,
  `score` integer DEFAULT 0 NOT NULL,
  `results` text NOT NULL,
  `actor_id` text NOT NULL,
  `created_at` integer NOT NULL
);

CREATE INDEX `readiness_runs_created_idx` ON `readiness_runs` (`created_at`);
