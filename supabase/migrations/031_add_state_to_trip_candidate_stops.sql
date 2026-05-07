-- Add denormalized state to trip_candidate_stops so state is available directly
-- on trip links for both verified and unverified sources.
ALTER TABLE trip_candidate_stops
  ADD COLUMN IF NOT EXISTS state TEXT;

-- Backfill from verified source when available.
UPDATE trip_candidate_stops t
SET state = s.state
FROM stops s
WHERE t.stop_id = s.id
  AND t.state IS NULL;

-- Backfill from unverified source when available.
UPDATE trip_candidate_stops t
SET state = u.state
FROM unverified_stops u
WHERE t.unverified_stop_id = u.id
  AND t.state IS NULL;

CREATE INDEX IF NOT EXISTS idx_trip_candidate_stops_state
  ON trip_candidate_stops(state);
