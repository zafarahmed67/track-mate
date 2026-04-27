-- Drop the per-trip custom_stops table (replaced by global unverified_stops
-- linked through trip_candidate_stops) and remove duplicated stop data from
-- trip_itineraries / itinerary_days. Stop-level info now lives only on
-- trip_candidate_stops; itinerary_days keeps day-route metadata only.

-- itinerary_days references custom_stops via custom_stop_id; drop that FK first.
ALTER TABLE itinerary_days
  DROP COLUMN IF EXISTS custom_stop_id,
  DROP COLUMN IF EXISTS stop_id,
  DROP COLUMN IF EXISTS is_selected,
  DROP COLUMN IF EXISTS day_order;

ALTER TABLE trip_itineraries DROP COLUMN IF EXISTS stops_by_day_json;

DROP TABLE IF EXISTS custom_stops CASCADE;
