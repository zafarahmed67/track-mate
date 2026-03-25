ALTER TABLE custom_stops ADD COLUMN IF NOT EXISTS day_index INTEGER;

CREATE INDEX IF NOT EXISTS idx_custom_stops_day ON custom_stops(trip_id, day_index);
