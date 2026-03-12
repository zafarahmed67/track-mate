-- Create stops table
CREATE TABLE IF NOT EXISTS purchases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  stop_id UUID REFERENCES stops(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  provider TEXT NOT NULL default 'stripe' CHECK (provider IN ('stripe', 'paypal', 'square')),
  purchase_date TIMESTAMPTZ DEFAULT NOW(),
  amount NUMERIC(10, 2) NOT NULL,
  purchase_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  unique (user_id, stop_id)
);

-- Enable RLS (optional - enable if you want row-level security)
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

-- Create indexes on foreign keys for faster lookups
CREATE INDEX IF NOT EXISTS idx_purchases_user_id ON purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_stop_id ON purchases(stop_id);
