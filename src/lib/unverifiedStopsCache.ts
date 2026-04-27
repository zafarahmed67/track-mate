import { supabaseAdmin } from "@/config/supabase";
import { env } from "@/config/env.config";

export interface UnverifiedStopRow {
  id: string;
  place_id: string;
  location_name: string;
  latitude: number;
  longitude: number;
  state: string | null;
  region: string | null;
  address: string | null;
  place_type: string | null;
  google_types: string[] | null;
  rating: number | null;
  user_ratings_total: number | null;
  review_status: "pending" | "promoted" | "rejected";
  hit_count: number;
}

export interface PlacesNearbyResult {
  place_id?: string;
  name?: string;
  vicinity?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
  types?: string[];
  rating?: number;
  user_ratings_total?: number;
}

/**
 * Default exclusion list for overnight-stop discovery: filters paid lodging,
 * roadside facilities, and fuel/service stations that aren't viable overnight
 * stays. Callers caching non-overnight categories (e.g. fuel-station lookups)
 * should pass `applyOvernightExclusion: false` to upsertMany.
 */
const NAME_EXCLUDE = /hotel|motel|hostel|backpacker|resort|inn\b|b&b|bed and breakfast|airbnb|toilet|toilets|amenities|amenity block|public toilet|car park|parking area|day use area|service station|fuel station|petrol station|\bservo\b|\bgas station\b/i;

/** Bounding-box lookup near a probe point. */
export async function findNearby(
  lat: number,
  lng: number,
  options: { bboxDeg?: number; placeTypes?: string[]; limit?: number } = {},
): Promise<UnverifiedStopRow[]> {
  if (!supabaseAdmin) return [];
  const bbox = options.bboxDeg ?? env.UNVERIFIED_CACHE_BBOX_DEG;
  const limit = options.limit ?? 100;

  let query = supabaseAdmin
    .from("unverified_stops")
    .select(
      "id, place_id, location_name, latitude, longitude, state, region, address, place_type, google_types, rating, user_ratings_total, review_status, hit_count",
    )
    .gte("latitude", lat - bbox)
    .lte("latitude", lat + bbox)
    .gte("longitude", lng - bbox)
    .lte("longitude", lng + bbox)
    .neq("review_status", "rejected")
    .limit(limit);

  if (options.placeTypes?.length) {
    query = query.in("place_type", options.placeTypes);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("[unverifiedStopsCache.findNearby] error", error);
    return [];
  }
  return (data ?? []) as UnverifiedStopRow[];
}

export async function findByPlaceIds(
  placeIds: string[],
): Promise<UnverifiedStopRow[]> {
  if (!supabaseAdmin || placeIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("unverified_stops")
    .select(
      "id, place_id, location_name, latitude, longitude, state, region, address, place_type, google_types, rating, user_ratings_total, review_status, hit_count",
    )
    .in("place_id", placeIds);
  if (error) {
    console.warn("[unverifiedStopsCache.findByPlaceIds] error", error);
    return [];
  }
  return (data ?? []) as UnverifiedStopRow[];
}

/**
 * Upsert Places API results into unverified_stops keyed by place_id.
 * On conflict bumps hit_count + updated_at without overwriting curator edits.
 * Returns the resolved rows (id <-> place_id) so callers can link via FKs.
 */
export async function upsertMany(
  places: PlacesNearbyResult[],
  opts: {
    firstSeenTripId?: string | null;
    placeType?: string;
    /** Default true. Set false when caching non-overnight categories (fuel, etc.). */
    applyOvernightExclusion?: boolean;
  } = {},
): Promise<UnverifiedStopRow[]> {
  if (!supabaseAdmin || places.length === 0) return [];
  const applyExclusion = opts.applyOvernightExclusion ?? true;

  const rows = places
    .map((p) => {
      const placeId = p.place_id ?? null;
      const name = (p.name ?? "").trim();
      const lat = Number(p.geometry?.location?.lat);
      const lng = Number(p.geometry?.location?.lng);
      if (!placeId || !name) return null;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      if (applyExclusion && NAME_EXCLUDE.test(name)) return null;
      return {
        place_id: placeId,
        location_name: name,
        latitude: lat,
        longitude: lng,
        address: p.vicinity ?? null,
        place_type: opts.placeType ?? p.types?.[0] ?? null,
        google_types: p.types ?? null,
        rating: typeof p.rating === "number" ? p.rating : null,
        user_ratings_total:
          typeof p.user_ratings_total === "number" ? p.user_ratings_total : null,
        first_seen_trip_id: opts.firstSeenTripId ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("unverified_stops")
    .upsert(rows, { onConflict: "place_id", ignoreDuplicates: false })
    .select(
      "id, place_id, location_name, latitude, longitude, state, region, address, place_type, google_types, rating, user_ratings_total, review_status, hit_count",
    );

  if (error) {
    console.warn("[unverifiedStopsCache.upsertMany] error", error);
    return [];
  }

  return (data ?? []) as UnverifiedStopRow[];
}

export function isExcludedName(name: string): boolean {
  return NAME_EXCLUDE.test(name);
}
