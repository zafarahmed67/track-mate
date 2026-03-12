-- Create stops table
CREATE TABLE IF NOT EXISTS stops (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  location_name TEXT,
  state TEXT,
  region TEXT,
  nearest_town TEXT,
  route_type TEXT,
  rig_suitability TEXT,
  access_type TEXT,
  water TEXT,
  dump_point TEXT,
  pet_friendly TEXT,
  best_season TEXT,
  stay_type TEXT,
  why_we_d_stay_again TEXT,
  confidence_level TEXT,
  tier TEXT,
  aao_tip TEXT,
  why_stop_here TEXT,
  best_travel_window TEXT,
  latitude TEXT,
  longitude TEXT,
  corridor TEXT,
  road_suitability TEXT,
  max_rig_length TEXT,
  cost_band TEXT,
  verification_status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (optional - enable if you want row-level security)
ALTER TABLE stops ENABLE ROW LEVEL SECURITY;

-- Create index on state for faster queries
CREATE INDEX IF NOT EXISTS idx_stops_state ON stops(state);

-- Create index on region for faster queries
CREATE INDEX IF NOT EXISTS idx_stops_region ON stops(region);


