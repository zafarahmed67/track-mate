-- Fix purchases table to match SRS §10 data model
-- The original 003_create_purchases_table.sql had wrong fields (stop_id, amount, provider)
-- and a wrong unique constraint. This migration replaces it.

DROP TABLE IF EXISTS purchases CASCADE;

CREATE TABLE purchases (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  source_order_id  TEXT,
  source           TEXT NOT NULL DEFAULT 'fabfunnels',
  product_name     TEXT,
  payment_status   TEXT NOT NULL DEFAULT 'paid',
  processed_at     TIMESTAMPTZ DEFAULT NOW(),
  created_at       TIMESTAMPTZ DEFAULT NOW(),

  -- Prevents duplicate processing of retried webhooks (SRS §8.2)
  UNIQUE (source_order_id)
);

ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_purchases_user_id        ON purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_source_order_id ON purchases(source_order_id);
