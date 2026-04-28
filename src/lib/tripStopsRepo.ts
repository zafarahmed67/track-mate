import { supabaseAdmin } from "@/config/supabase";

export interface DayStopOption {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  distance_from_start_km: number | null;
  sourceType: "verified" | "unverified";
  isSelected: boolean;
  dayOrder: number;
  stopId?: string;
  unverifiedStopId?: string;
}

export interface StopsByDay {
  [dayKey: string]: DayStopOption[];
}

type StopJoin = { id: string; location_name: string; latitude: number; longitude: number };
interface TripCandidateRow {
  id: string;
  trip_id: string;
  stop_id: string | null;
  unverified_stop_id: string | null;
  source_type: string | null;
  day_index: number | null;
  day_order: number | null;
  is_selected: boolean | null;
  distance_from_start_km: number | null;
  stops: StopJoin | StopJoin[] | null;
  unverified_stops: StopJoin | StopJoin[] | null;
}

function pickJoin<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

/**
 * Single source of truth for "which stops on which day for this trip."
 * Joins trip_candidate_stops to either stops (verified) or unverified_stops
 * (cache) and groups by day_index. The planner UI consumes this directly.
 */
export async function getTripStopsByDay(
  tripId: string,
): Promise<StopsByDay> {
  if (!supabaseAdmin) return {};
  const { data, error } = await supabaseAdmin
    .from("trip_candidate_stops")
    .select(
      `id, trip_id, stop_id, unverified_stop_id, source_type, day_index, day_order, is_selected, distance_from_start_km,
       stops:stops(id, location_name, latitude, longitude),
       unverified_stops:unverified_stops(id, location_name, latitude, longitude)`,
    )
    .eq("trip_id", tripId)
    .not("day_index", "is", null)
    .order("day_index", { ascending: true })
    .order("day_order", { ascending: true });

  if (error) {
    console.warn("[tripStopsRepo.getTripStopsByDay] error", error);
    return {};
  }

  const byDay: StopsByDay = {};
  for (const raw of (data ?? []) as unknown as TripCandidateRow[]) {
    const dayIndex = raw.day_index;
    if (dayIndex === null || dayIndex === undefined) continue;
    const dayKey = `day${dayIndex + 1}`;
    if (!byDay[dayKey]) byDay[dayKey] = [];

    const verified = pickJoin(raw.stops);
    const unverified = pickJoin(raw.unverified_stops);
    const sourceType: "verified" | "unverified" = verified ? "verified" : "unverified";
    const stopRef = verified ?? unverified;
    if (!stopRef) continue;

    byDay[dayKey].push({
      id: stopRef.id,
      name: stopRef.location_name,
      latitude: Number(stopRef.latitude),
      longitude: Number(stopRef.longitude),
      distance_from_start_km: raw.distance_from_start_km,
      sourceType,
      isSelected: !!raw.is_selected,
      dayOrder: raw.day_order ?? 1,
      stopId: raw.stop_id ?? undefined,
      unverifiedStopId: raw.unverified_stop_id ?? undefined,
    });
  }
  return byDay;
}
