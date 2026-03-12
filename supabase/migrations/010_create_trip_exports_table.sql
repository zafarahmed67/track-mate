CREATE TABLE IF NOT EXISTS trip_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  export_type TEXT NOT NULL CHECK (export_type IN ('pdf')),
  storage_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'complete', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Enable RLS (optional - enable if you want row-level security)
ALTER TABLE trip_exports ENABLE ROW LEVEL SECURITY;

-- Create indexes for export processing
CREATE INDEX IF NOT EXISTS idx_trip_exports_trip_id ON trip_exports(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_exports_status ON trip_exports(status);
