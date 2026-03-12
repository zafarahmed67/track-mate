CREATE TABLE IF NOT EXISTS trip_candidate_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  stop_id UUID NOT NULL REFERENCES stops(id) ON DELETE CASCADE,

  rank_score NUMERIC(10,4),
  distance_to_route_km NUMERIC(10,2),
  detour_minutes INTEGER,
  suitability_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  rejected_reason TEXT,
  selected_by_ai BOOLEAN DEFAULT FALSE,

  generation_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (trip_id, stop_id, generation_version)
);

-- Enable RLS (optional - enable if you want row-level security)
ALTER TABLE trip_candidate_stops ENABLE ROW LEVEL SECURITY;

-- Create index on state for faster queries
CREATE INDEX IF NOT EXISTS idx_trip_candidate_stops_trip_id ON trip_candidate_stops(trip_id);

-- Create index on region for faster queries
CREATE INDEX IF NOT EXISTS idx_trip_candidate_stops_stop_id ON trip_candidate_stops(stop_id);
