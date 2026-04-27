-- Global, cross-trip cache for Google Places lookups so subsequent trips can
-- skip the API call entirely when the stop is already known.
CREATE TABLE IF NOT EXISTS unverified_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id TEXT UNIQUE NOT NULL,
  location_name TEXT NOT NULL,
  latitude NUMERIC(9,6) NOT NULL,
  longitude NUMERIC(9,6) NOT NULL,
  state TEXT,
  region TEXT,
  address TEXT,
  place_type TEXT,
  google_types TEXT[],
  rating NUMERIC(2,1),
  user_ratings_total INTEGER,
  source TEXT NOT NULL DEFAULT 'google_places',
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'promoted', 'rejected')),
  first_seen_trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
  hit_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE unverified_stops ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_unverified_stops_geo ON unverified_stops (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_unverified_stops_state ON unverified_stops (state);
CREATE INDEX IF NOT EXISTS idx_unverified_stops_status ON unverified_stops (review_status);
