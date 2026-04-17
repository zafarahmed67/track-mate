-- Performance indexes for user_id lookups
-- Run this in Supabase SQL Editor

-- Main trips table index (fixes /api/trips slow queries)
CREATE INDEX IF NOT EXISTS idx_trips_user_id ON trips(user_id);

-- Also index for created_at sorting (common pattern)
CREATE INDEX IF NOT EXISTS idx_trips_user_created ON trips(user_id, created_at DESC);

-- Custom stops table index (for trip lookups)
CREATE INDEX IF NOT EXISTS idx_custom_stops_trip ON custom_stops(trip_id);

-- Trip candidate stops
CREATE INDEX IF NOT EXISTS idx_trip_candidate_stops_trip ON trip_candidate_stops(trip_id);

-- Stops table for bbox queries
CREATE INDEX IF NOT EXISTS idx_stops_bbox ON stops(latitude, longitude);

-- Messages/references tables if needed
CREATE INDEX IF NOT EXISTS idx_messages_trip ON messages(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_candidates_trip ON trip_candidates(trip_id);