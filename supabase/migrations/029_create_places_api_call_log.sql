-- Per-call log of every Google Maps / Places API request the server makes.
-- Lets the dashboard show exactly which endpoint was hit how many times for
-- a given trip, including UI-triggered calls (fuel, search) that happen
-- after trip generation and aren't captured in route_data_json.placesBudget.
CREATE TABLE IF NOT EXISTS places_api_call_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  place_type TEXT,
  result_count INTEGER,
  cache_outcome TEXT
    CHECK (cache_outcome IN ('hit', 'miss', 'partial', 'skipped') OR cache_outcome IS NULL),
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE places_api_call_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_places_api_call_log_trip_id ON places_api_call_log (trip_id);
CREATE INDEX IF NOT EXISTS idx_places_api_call_log_created_at ON places_api_call_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_places_api_call_log_endpoint ON places_api_call_log (endpoint);
