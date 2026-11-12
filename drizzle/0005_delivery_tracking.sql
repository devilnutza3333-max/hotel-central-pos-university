ALTER TABLE `delivery_orders` ADD `tracking_token` text;
--> statement-breakpoint
ALTER TABLE `delivery_orders` ADD `rider_id` text;
--> statement-breakpoint
ALTER TABLE `delivery_orders` ADD `picked_up_at` integer;
--> statement-breakpoint
ALTER TABLE `delivery_orders` ADD `near_arrival_at` integer;
--> statement-breakpoint
UPDATE `delivery_orders` SET `tracking_token` = lower(hex(randomblob(24))) WHERE `tracking_token` IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_orders_tracking_token_unique` ON `delivery_orders` (`tracking_token`);
--> statement-breakpoint
CREATE INDEX `delivery_orders_rider_status_idx` ON `delivery_orders` (`rider_id`,`status`);
