-- Create stops table
CREATE TABLE IF NOT EXISTS trips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL default 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  title TEXT,
  start_location_text TEXT NOT NULL,
  destination_text TEXT NOT NULL,
  start_lat double precision,
  start_lng double precision,
  destination_lat double precision,
  destination_lng double precision,
  trip_duration_days INT NOT NULL,
  travel_pace TEXT NOT NULL CHECK (travel_pace IN ('leisurely', 'moderate', 'fast')),
  rig_type TEXT,
  rig_length_m numeric(5, 2),
  pet_friendly_required BOOLEAN DEFAULT FALSE,
  stay_preference TEXT,
  avoid_gravel_roads BOOLEAN DEFAULT FALSE,
  budget_preference TEXT,

  planner_input_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  route_data_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  notes TEXT,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (optional - enable if you want row-level security)
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

-- Create indexes for common trip queries
CREATE INDEX IF NOT EXISTS idx_trips_user_id ON trips(user_id);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
