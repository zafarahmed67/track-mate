
CREATE TABLE IF NOT EXISTS itinerary_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_number INTEGER NOT NULL,
  from_location TEXT,
  to_location TEXT,
  distance_km NUMERIC(10,2),
  drive_time_minutes INTEGER,
  stop_id UUID REFERENCES stops(id) ON DELETE SET NULL,
  reason TEXT,
  aao_tip TEXT,
  day_json JSONB NOT NULL DEFAULT '{}'::JSONB,

  UNIQUE (itinerary_id, day_number)
);

-- Enable RLS (optional - enable if you want row-level security)
ALTER TABLE itinerary_days ENABLE ROW LEVEL SECURITY;

-- Create indexes for day-level queries
CREATE INDEX IF NOT EXISTS idx_itinerary_days_itinerary_id ON itinerary_days(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_days_stop_id ON itinerary_days(stop_id);
