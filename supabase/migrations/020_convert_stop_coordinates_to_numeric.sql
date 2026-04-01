-- Convert latitude and longitude from TEXT to DOUBLE PRECISION for correct numeric comparisons
ALTER TABLE stops 
  ALTER COLUMN latitude TYPE DOUBLE PRECISION USING NULLIF(latitude, '')::DOUBLE PRECISION,
  ALTER COLUMN longitude TYPE DOUBLE PRECISION USING NULLIF(longitude, '')::DOUBLE PRECISION;

-- Add indexes for geographic queries
CREATE INDEX IF NOT EXISTS idx_stops_latitude ON stops(latitude);
CREATE INDEX IF NOT EXISTS idx_stops_longitude ON stops(longitude);
CREATE INDEX IF NOT EXISTS idx_stops_lat_lng ON stops(latitude, longitude);
