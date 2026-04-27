import { supabaseAdmin } from "@/config/supabase";

export interface PlacesCallLogEntry {
  tripId?: string | null;
  endpoint: string;
  placeType?: string | null;
  resultCount?: number | null;
  cacheOutcome?: "hit" | "miss" | "partial" | "skipped" | null;
  /** Free-form caller tag, e.g. "generateCustomStop", "fuel-along-route". */
  source?: string | null;
}

/**
 * Fire-and-forget logger for Google Maps / Places API calls. Failures are
 * swallowed (logged to console) so a logging fault never breaks a request.
 */
export function logPlacesCall(entry: PlacesCallLogEntry): void {
  if (!supabaseAdmin) return;
  void supabaseAdmin
    .from("places_api_call_log")
    .insert({
      trip_id: entry.tripId ?? null,
      endpoint: entry.endpoint,
      place_type: entry.placeType ?? null,
      result_count: entry.resultCount ?? null,
      cache_outcome: entry.cacheOutcome ?? null,
      source: entry.source ?? null,
    })
    .then(({ error }) => {
      if (error) console.warn("[placesApiLog] insert failed", error.message);
    });
}

export interface PlacesCallAggregate {
  total: number;
  byEndpoint: Record<string, number>;
  byOutcome: Record<string, number>;
}

/** Aggregate the raw log into byEndpoint / byOutcome counts for a trip. */
export async function aggregatePlacesCallsForTrip(
  tripId: string,
): Promise<PlacesCallAggregate> {
  const empty: PlacesCallAggregate = {
    total: 0,
    byEndpoint: {},
    byOutcome: {},
  };
  if (!supabaseAdmin) return empty;

  const { data, error } = await supabaseAdmin
    .from("places_api_call_log")
    .select("endpoint, cache_outcome")
    .eq("trip_id", tripId);

  if (error) {
    console.warn("[placesApiLog] aggregate failed", error.message);
    return empty;
  }

  const byEndpoint: Record<string, number> = {};
  const byOutcome: Record<string, number> = {};
  for (const row of data ?? []) {
    const endpoint = (row as { endpoint: string }).endpoint || "unknown";
    byEndpoint[endpoint] = (byEndpoint[endpoint] ?? 0) + 1;
    const outcome = (row as { cache_outcome: string | null }).cache_outcome;
    if (outcome) byOutcome[outcome] = (byOutcome[outcome] ?? 0) + 1;
  }

  return {
    total: (data ?? []).length,
    byEndpoint,
    byOutcome,
  };
}
