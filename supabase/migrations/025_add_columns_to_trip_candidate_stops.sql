-- Add missing columns to trip_candidate_stops
ALTER TABLE trip_candidate_stops ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'verified';
ALTER TABLE trip_candidate_stops ADD COLUMN IF NOT EXISTS distance_from_start_km NUMERIC(10,2);
ALTER TABLE trip_candidate_stops ADD COLUMN IF NOT EXISTS distance_to_dest_km NUMERIC(10,2);

-- Add missing columns to custom_stops
ALTER TABLE custom_stops ADD COLUMN IF NOT EXISTS distance_from_start_km NUMERIC(10,2);