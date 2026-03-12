CREATE TABLE IF NOT EXISTS trip_itineraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'manual', 'system')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'failed')),

  trip_snapshot_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  itinerary_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  model_name TEXT,
  prompt_version TEXT,
  validation_errors_json JSONB NOT NULL DEFAULT '[]'::JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (trip_id, version)
);

-- Enable RLS (optional - enable if you want row-level security)
ALTER TABLE trip_itineraries ENABLE ROW LEVEL SECURITY;

-- Create indexes for itinerary lookups
CREATE INDEX IF NOT EXISTS idx_trip_itineraries_trip_id ON trip_itineraries(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_itineraries_status ON trip_itineraries(status);
