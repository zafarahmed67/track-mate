-- Make trip_candidate_stops the single source of truth for trip <-> stop links.
-- Each row references EITHER a verified stop (stops) OR a cached unverified stop
-- (unverified_stops), never both. Day-level fields (day_index, day_order,
-- is_selected) live here so we no longer need to duplicate them into
-- itinerary_days or trip_itineraries.stops_by_day_json.

ALTER TABLE trip_candidate_stops
  ADD COLUMN IF NOT EXISTS unverified_stop_id UUID REFERENCES unverified_stops(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS day_index INTEGER,
  ADD COLUMN IF NOT EXISTS day_order INTEGER,
  ADD COLUMN IF NOT EXISTS is_selected BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE trip_candidate_stops ALTER COLUMN stop_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trip_candidate_stops_one_ref'
  ) THEN
    ALTER TABLE trip_candidate_stops
      ADD CONSTRAINT trip_candidate_stops_one_ref CHECK (
        (stop_id IS NOT NULL AND unverified_stop_id IS NULL) OR
        (stop_id IS NULL AND unverified_stop_id IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tcs_trip_day ON trip_candidate_stops (trip_id, day_index, day_order);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tcs_dedup_verified
  ON trip_candidate_stops (trip_id, stop_id) WHERE stop_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tcs_dedup_unverified
  ON trip_candidate_stops (trip_id, unverified_stop_id) WHERE unverified_stop_id IS NOT NULL;
