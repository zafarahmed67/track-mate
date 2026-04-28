-- Replace the partial unique index on trip_candidate_stops(trip_id,
-- unverified_stop_id) with a non-partial one so PostgREST/Supabase upserts
-- can use it as the ON CONFLICT arbiter.
--
-- PostgreSQL refuses to use a partial unique index for ON CONFLICT inference
-- unless the INSERT statement includes a WHERE clause exactly matching the
-- partial predicate. The Supabase JS client emits only `ON CONFLICT (cols)`
-- without WHERE, so the upsert in organizeStopsByDay.ts was failing with
-- error 42P10 ("there is no unique or exclusion constraint matching the
-- ON CONFLICT specification") and silently dropping all 12 unverified-stop
-- links per trip.
--
-- Why dropping the partial WHERE is safe: the CHECK constraint
-- trip_candidate_stops_one_ref (added in migration 027) already enforces
-- "exactly one of stop_id / unverified_stop_id is non-null". With default
-- NULL-distinct semantics, multiple verified rows in the same trip all carry
-- (trip_id, NULL) and don't conflict with each other. Behaviour for non-null
-- unverified_stop_id rows is identical to the partial index.

DROP INDEX IF EXISTS idx_tcs_dedup_unverified;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tcs_dedup_unverified
  ON trip_candidate_stops (trip_id, unverified_stop_id);

-- Same treatment for the verified partial. The legacy unique constraint
-- (trip_id, stop_id, generation_version) from migration 006 still exists and
-- still serves the verified upsert path — but having a clean non-partial
-- (trip_id, stop_id) index makes future reads and upserts simpler. NULL
-- entries (unverified rows) are distinct under default semantics.

DROP INDEX IF EXISTS idx_tcs_dedup_verified;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tcs_dedup_verified
  ON trip_candidate_stops (trip_id, stop_id);
