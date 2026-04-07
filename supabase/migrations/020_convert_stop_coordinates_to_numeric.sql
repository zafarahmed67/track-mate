-- Convert latitude and longitude from TEXT to DOUBLE PRECISION for correct numeric comparisons
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'stops' AND column_name = 'latitude') = 'text' THEN
    ALTER TABLE stops
      ALTER COLUMN latitude TYPE DOUBLE PRECISION USING CASE WHEN TRIM(latitude) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN TRIM(latitude)::DOUBLE PRECISION ELSE NULL END,
      ALTER COLUMN longitude TYPE DOUBLE PRECISION USING CASE WHEN TRIM(longitude) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN TRIM(longitude)::DOUBLE PRECISION ELSE NULL END;
  END IF;
END $$;

-- Add indexes for geographic queries
CREATE INDEX IF NOT EXISTS idx_stops_latitude ON stops(latitude);
CREATE INDEX IF NOT EXISTS idx_stops_longitude ON stops(longitude);
CREATE INDEX IF NOT EXISTS idx_stops_lat_lng ON stops(latitude, longitude);
