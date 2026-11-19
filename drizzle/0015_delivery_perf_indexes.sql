-- Delivery read-path optimization for 200 orders per day.
-- Safe, additive indexes; no deletes, no resets and no changes to existing rows.
-- Include status ready_for_pickup in the per-phone active-order limit at API layer.
CREATE INDEX IF NOT EXISTS delivery_orders_phone_status_idx
  ON delivery_orders (phone, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS delivery_orders_recent_idx
  ON delivery_orders (created_at DESC, id DESC);
