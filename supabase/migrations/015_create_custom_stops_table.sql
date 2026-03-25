CREATE TABLE IF NOT EXISTS custom_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  location_name TEXT NOT NULL,
  latitude TEXT NOT NULL,
  longitude TEXT NOT NULL,
  address TEXT,
  place_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE custom_stops ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_custom_stops_trip_id ON custom_stops(trip_id);
