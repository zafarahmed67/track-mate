-- Create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS trip_itineraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  stops_by_day_json JSONB DEFAULT '{}'::JSONB, -- Fixed the missing comma here
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'failed')),

  trip_snapshot_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  itinerary_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  validation_errors_json JSONB NOT NULL DEFAULT '[]'::JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (trip_id, version)
);

-- Enable Row Level Security (RLS) if desired
ALTER TABLE trip_itineraries ENABLE ROW LEVEL SECURITY;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_trip_itineraries_trip_id ON trip_itineraries(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_itineraries_status ON trip_itineraries(status);