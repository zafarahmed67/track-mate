import { supabaseAdmin } from "@/config/supabase";
import { applySuitabilityFilter } from "@/lib/stopSuitabilityFilter";
import { calculateDistance } from "./calculateDistance";

interface DayStopOption {
  id: string
  sourceType: "verified" | "custom"
  name: string
  latitude: number
  longitude: number
  distanceFromStartKm: number
  stopId?: string
  customStopId?: string
}

export async function organizeStopsByDay(
  tripId: string,
  startLat: number,
  startLng: number,
  destLat: number,
  destLng: number,
  tripDays: number,
  totalDistanceKm: number,
  preferences: {
    stay_preference: string | null
    budget_preference: string | null
    avoid_gravel_roads: boolean
    pet_friendly_required: boolean
    rig_type: string | null
    rig_length_m: number | null
    end_date: string | null
    trip_duration_days: number
  } | null
): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error("Database not configured")
  }

  console.log("[organizeStopsByDay] SERVER: Received preferences:", JSON.stringify(preferences, null, 2))

  const userDays = Math.max(1, Math.round(Number(tripDays) || 1))
  const kmPerDay = totalDistanceKm / userDays

  const { data: verifiedStops } = await supabaseAdmin
    .from("trip_candidate_stops")
    .select("*, stops:stops(id, location_name, latitude, longitude, rig_suitability, road_suitability, pet_friendly, stay_type, cost_band, max_rig_length, best_season)")
    .eq("trip_id", tripId)
    .eq("source_type", "verified")

    console.log("[4/4] Loaded verified stops for day organization", { count: verifiedStops })

  const { data: customStops, error: customStopsError } = await supabaseAdmin
    .from("custom_stops")
    .select("id, location_name, latitude, longitude, place_type, distance_from_start_km")
    .eq("trip_id", tripId)

        console.log("[4/4] Loaded custom stops for day organization", { count: customStops, error: customStopsError })

  if (customStopsError) {
    console.error("[4/4] Failed to load custom stops for day organization:", customStopsError)
  }

  const allStops: DayStopOption[] = []

  if (verifiedStops) {
    const filterableStops = verifiedStops
      .map((vs) => {
        const stop = vs.stops as {
          id: string
          location_name: string
          latitude: number
          longitude: number
          rig_suitability?: string
          road_suitability?: string
          pet_friendly?: string
          stay_type?: string
          cost_band?: string
          max_rig_length?: string
          best_season?: string
        } | null
        if (!stop) return null
        return {
          rig_suitability: stop.rig_suitability ?? "",
          road_suitability: stop.road_suitability ?? "",
          pet_friendly: stop.pet_friendly ?? "",
          stay_type: stop.stay_type ?? "",
          cost_band: stop.cost_band ?? "",
          max_rig_length: stop.max_rig_length ?? "",
          best_season: stop.best_season ?? "",
          ...vs,
          _stop: stop,
        }
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)

    const tripPrefs = preferences ? {
      rig_type: preferences.rig_type,
      rig_length_m: preferences.rig_length_m,
      pet_friendly_required: preferences.pet_friendly_required,
      avoid_gravel_roads: preferences.avoid_gravel_roads,
      stay_preference: preferences.stay_preference,
      budget_preference: preferences.budget_preference,
      end_date: preferences.end_date,
      trip_duration_days: preferences.trip_duration_days,
    } : null

    const filteredStops = tripPrefs
      ? applySuitabilityFilter(filterableStops, tripPrefs)
      : filterableStops

    console.log("[organizeStopsByDay] SERVER: Filter Results:", {
      beforeFilter: filterableStops.length,
      afterFilter: filteredStops.length,
      tripPrefs: tripPrefs,
      sampleStopsBefore: filterableStops.slice(0, 3).map(s => ({
        name: s._stop?.location_name,
        stay_type: s.stay_type,
        cost_band: s.cost_band,
        rig_suitability: s.rig_suitability,
      })),
      sampleStopsAfter: filteredStops.slice(0, 3).map(s => ({
        name: s._stop?.location_name,
        stay_type: s.stay_type,
        cost_band: s.cost_band,
        rig_suitability: s.rig_suitability,
      })),
    })

    for (const vs of filteredStops) {
      const stop = vs._stop
      if (stop) {
        const distFromStart = vs.distance_from_start_km ??
          (vs.distance_to_route_km ?? calculateDistance(startLat, startLng, stop.latitude, stop.longitude))
        allStops.push({
          id: stop.id,
          sourceType: "verified",
          name: stop.location_name,
          latitude: stop.latitude,
          longitude: stop.longitude,
          distanceFromStartKm: distFromStart,
          stopId: stop.id,
        })
      }
    }
  }

  if (customStops) {
    for (const cs of customStops) {
      const latitude = typeof cs.latitude === "number" ? cs.latitude : Number(cs.latitude)
      const longitude = typeof cs.longitude === "number" ? cs.longitude : Number(cs.longitude)
      allStops.push({
        id: cs.id,
        sourceType: "custom",
        name: cs.location_name,
        latitude,
        longitude,
        distanceFromStartKm: cs.distance_from_start_km ?? calculateDistance(startLat, startLng, latitude, longitude),
        customStopId: cs.id,
      })
    }
  }

  console.log("[4/4] All stops before sorting:", {
    total: allStops.length,
    verified: allStops.filter(s => s.sourceType === "verified").length,
    custom: allStops.filter(s => s.sourceType === "custom").length,
    sample: allStops.slice(0, 3).map(s => ({ name: s.name, dist: s.distanceFromStartKm })),
    maxDistanceKm: Math.round(Math.max(0, ...allStops.map((s) => s.distanceFromStartKm))),
  })

  allStops.sort((a, b) => a.distanceFromStartKm - b.distanceFromStartKm)

  const sortedByPriority = [
    ...allStops.filter((s) => s.sourceType === "verified"),
    ...allStops.filter((s) => s.sourceType === "custom"),
  ]

  const dayOptions: Array<{
    dayNumber: number
    targetKm: number
    options: DayStopOption[]
  }> = []

  const usedStopIds = new Set<string>()

  let currentDay = 1
  while (currentDay <= userDays) {
    const targetKm = kmPerDay * currentDay
    const minKm = currentDay === 1 ? 0 : kmPerDay * (currentDay - 1)

    console.log("[4/4] Processing day", currentDay, { targetKm, minKm, totalStops: sortedByPriority.length })

    // More lenient filter: include stops within range of current day segment
    const relevantStops = sortedByPriority.filter(
      (s) => s.distanceFromStartKm <= targetKm + kmPerDay * 0.5 &&
        s.distanceFromStartKm >= minKm - kmPerDay * 0.2
    )

    console.log("[4/4] Relevant stops for day", currentDay, {
      found: relevantStops.length,
      inRange: relevantStops.map(s => s.name)
    })

    const uniqueByName = new Map<string, DayStopOption>()
    for (const stop of relevantStops) {
      if (usedStopIds.has(stop.id)) continue
      const key = stop.name.toLowerCase().trim()
      if (!uniqueByName.has(key)) {
        uniqueByName.set(key, stop)
      }
    }

    let options = Array.from(uniqueByName.values())
      .sort((a, b) => Math.abs(a.distanceFromStartKm - targetKm) - Math.abs(b.distanceFromStartKm - targetKm))
      .slice(0, 3)

    // If not enough options, fill from nearest forward candidates only.
    // Pulling from the beginning of the route makes later days look empty after
    // the planner rejects backward/non-progressing overnight choices.
    if (options.length < 3) {
      const fallbackMinKm = Math.max(0, minKm - Math.min(25, kmPerDay * 0.1))
      const remaining = sortedByPriority
        .filter((s) => s.distanceFromStartKm >= fallbackMinKm)
        .filter(s => !options.some(o => o.id === s.id))
        .sort((a, b) => Math.abs(a.distanceFromStartKm - targetKm) - Math.abs(b.distanceFromStartKm - targetKm))
      options = [...options, ...remaining].slice(0, 3)
    }

    console.log("[4/4] Selected options for day", currentDay, {
      count: options.length,
      options: options.map(o => ({ name: o.name, dist: Math.round(o.distanceFromStartKm) }))
    })

    options.length = Math.min(options.length, 3)

    dayOptions.push({
      dayNumber: currentDay,
      targetKm,
      options,
    })

    for (const opt of options) {
      usedStopIds.add(opt.id)
    }

    currentDay++
  }

  const existingItinerary = await supabaseAdmin
    .from("trip_itineraries")
    .select("version")
    .eq("trip_id", tripId)
    .order("version", { ascending: false })
    .limit(1)
    .single()

  const nextVersion = (existingItinerary?.data?.version ?? 0) + 1

  await supabaseAdmin
    .from("trip_itineraries")
    .update({ status: "superseded" })
    .eq("trip_id", tripId)
    .eq("status", "active")

  const stopsByDayJson: Record<string, unknown> = {}
  const itineraryDayRows: Array<{
    itinerary_id?: string
    day_number: number
    day_order: number
    source_type: string
    stop_id: string | null
    custom_stop_id: string | null
    is_selected: boolean
    from_location: string
    to_location: string
    distance_km: number | null
  }> = []

  for (const day of dayOptions) {
    const dayStopsJson: Array<{
      id: string
      name: string
      sourceType: string
      isSelected: boolean
      dayOrder: number
    }> = []

    for (let i = 0; i < day.options.length; i++) {
      const opt = day.options[i]
      const isSelected = i === 0

      dayStopsJson.push({
        id: opt.id,
        name: opt.name,
        sourceType: opt.sourceType,
        isSelected,
        dayOrder: i + 1,
      })

      itineraryDayRows.push({
        day_number: day.dayNumber,
        day_order: i + 1,
        source_type: opt.sourceType,
        stop_id: opt.stopId ?? null,
        custom_stop_id: opt.customStopId ?? null,
        is_selected: isSelected,
        from_location: day.dayNumber === 1 ? "Start" : `Day ${day.dayNumber - 1}`,
        to_location: opt.name,
        distance_km: Math.round(kmPerDay),
      })
    }

    stopsByDayJson[`day${day.dayNumber}`] = dayStopsJson
  }

  const { data: itineraryRecord, error: itineraryError } = await supabaseAdmin
    .from("trip_itineraries")
    .insert({
      trip_id: tripId,
      version: nextVersion,
      source: "system",
      status: "active",
      stops_by_day_json: stopsByDayJson,
    })
    .select("id")
    .single()

  if (itineraryError) {
    console.error("Failed to create itinerary:", itineraryError)
    return
  }

  if (itineraryRecord && itineraryDayRows.length > 0) {
    const rowsWithItineraryId = itineraryDayRows.map((row) => ({
      ...row,
      itinerary_id: itineraryRecord.id,
    }))

    await supabaseAdmin.from("itinerary_days").insert(rowsWithItineraryId)
  }

  console.log("[4/4] Organized stops by day", {
    tripId,
    days: userDays,
    totalStopsAvailable: sortedByPriority.length,
    optionsPerDay: dayOptions.map((d) => d.options.length),
    totalRows: itineraryDayRows.length,
    dayDetails: dayOptions.map(d => ({
      day: d.dayNumber,
      options: d.options.map(o => ({ name: o.name, source: o.sourceType }))
    }))
  })
}