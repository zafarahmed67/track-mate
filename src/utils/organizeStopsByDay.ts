import { supabaseAdmin } from "@/config/supabase";
import { applySuitabilityFilter } from "@/lib/stopSuitabilityFilter";
import { calculateDistance } from "./calculateDistance";
import {
  decodePolyline,
  buildCumulativeDistanceTable,
  samplePolylineAtKm,
  projectPointOntoPolyline,
  PolylinePoint,
} from "@/lib/routePolyline";

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

// Name patterns to exclude from overnight stop options — fuel/service stations
// can appear under rv_park/campground searches in rural Australia.
const OVERNIGHT_EXCLUDE =
  /hotel|motel|hostel|backpacker|resort|inn\b|b&b|bed and breakfast|airbnb|toilet|toilets|amenities|amenity block|public toilet|car park|parking area|day use area|service station|fuel station|petrol station|\bservo\b|\bgas station\b/i

// Google Places search types used for targeted per-day overnight stop lookups.
const OVERNIGHT_SEARCHES: Array<{ type: string; keyword?: string }> = [
  { type: "rv_park" },
  { type: "campground" },
  { type: "rv_park", keyword: "caravan park" },
  { type: "rv_park", keyword: "holiday park" },
  { type: "campground", keyword: "free camp" },
  { type: "campground", keyword: "showground" },
  { type: "campground", keyword: "roadhouse" },
  { type: "campground", keyword: "national park" },
]

/**
 * Search Google Places for overnight stops near a lat/lng.
 * Returns candidates sorted by lateral distance from the route (closest first).
 */
async function searchGooglePlacesForDay(
  lat: number,
  lng: number,
  radiusMetres: number,
  apiKey: string,
  polyline: PolylinePoint[],
  cumTable: number[],
  maxLateralKm: number,
): Promise<DayStopOption[]> {
  const seenNames = new Set<string>()
  const candidates: DayStopOption[] = []

  for (const search of OVERNIGHT_SEARCHES) {
    try {
      const params = new URLSearchParams({
        location: `${lat},${lng}`,
        radius: String(radiusMetres),
        type: search.type,
        key: apiKey,
      })
      if (search.keyword) params.set("keyword", search.keyword)

      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`
      )
      const data = await res.json()
      if (!data.results) continue

      for (const place of data.results.slice(0, 15)) {
        const name = String(place.name ?? "").trim()
        if (!name || OVERNIGHT_EXCLUDE.test(name)) continue

        const placeLat = Number(place.geometry?.location?.lat ?? 0)
        const placeLng = Number(place.geometry?.location?.lng ?? 0)
        if (!placeLat || !placeLng) continue

        const nameKey = name.toLowerCase()
        if (seenNames.has(nameKey)) continue

        const { distanceFromStartKm, lateralKm } = projectPointOntoPolyline(
          placeLat, placeLng, polyline, cumTable
        )
        if (lateralKm > maxLateralKm) continue

        seenNames.add(nameKey)
        candidates.push({
          id: place.place_id ?? `gp-${nameKey}`,
          sourceType: "custom",
          name,
          latitude: placeLat,
          longitude: placeLng,
          distanceFromStartKm,
        })
      }
    } catch {
      // skip failed search type
    }
  }

  // Sort by lateral distance (closest to route wins)
  return candidates.sort(
    (a, b) =>
      projectPointOntoPolyline(a.latitude, a.longitude, polyline, cumTable).lateralKm -
      projectPointOntoPolyline(b.latitude, b.longitude, polyline, cumTable).lateralKm
  )
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
  } | null,
  encodedPolyline?: string,
  googleApiKey?: string,
): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error("Database not configured")
  }

  const userDays = Math.max(1, Math.round(Number(tripDays) || 1))
  const kmPerDay = totalDistanceKm / userDays

  // Decode polyline for accurate per-day target locations.
  let polyline: PolylinePoint[] = []
  let cumTable: number[] = []
  if (encodedPolyline) {
    polyline = decodePolyline(encodedPolyline)
    cumTable = buildCumulativeDistanceTable(polyline)
  }

  const hasPolyline = polyline.length >= 2

  // Whether this is a remote/sparse route — allows wider lateral corridor.
  const directDistanceKm = calculateDistance(startLat, startLng, destLat, destLng)
  const isRemoteRoute = directDistanceKm > 500 && destLat > startLat
  const maxLateralKm = isRemoteRoute ? 50 : 30

  // ── Load verified stops (trip_candidate_stops) ──────────────────────────────
  const { data: verifiedRows } = await supabaseAdmin
    .from("trip_candidate_stops")
    .select(
      "*, stops:stops(id, location_name, latitude, longitude, rig_suitability, road_suitability, pet_friendly, stay_type, cost_band, max_rig_length, best_season)"
    )
    .eq("trip_id", tripId)
    .eq("source_type", "verified")

  const tripPrefs = preferences
    ? {
        rig_type: preferences.rig_type,
        rig_length_m: preferences.rig_length_m,
        pet_friendly_required: preferences.pet_friendly_required,
        avoid_gravel_roads: preferences.avoid_gravel_roads,
        stay_preference: preferences.stay_preference,
        budget_preference: preferences.budget_preference,
        end_date: preferences.end_date,
        trip_duration_days: preferences.trip_duration_days,
      }
    : null

  const filterableVerified = (verifiedRows ?? [])
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

  const filteredVerified = tripPrefs
    ? applySuitabilityFilter(filterableVerified, tripPrefs)
    : filterableVerified

  const verifiedPool: DayStopOption[] = filteredVerified
    .flatMap((vs) => {
      const stop = vs._stop
      if (!stop) return []
      const distFromStart =
        vs.distance_from_start_km ??
        (vs.distance_to_route_km ??
          calculateDistance(startLat, startLng, stop.latitude, stop.longitude))
      const opt: DayStopOption = {
        id: stop.id,
        sourceType: "verified",
        name: stop.location_name,
        latitude: stop.latitude,
        longitude: stop.longitude,
        distanceFromStartKm: distFromStart,
        stopId: stop.id,
      }
      return [opt]
    })

  // ── Load pre-generated custom stops (broad sweep from generateCustomStop) ──
  const { data: customRows } = await supabaseAdmin
    .from("custom_stops")
    .select("id, location_name, latitude, longitude, place_type, distance_from_start_km")
    .eq("trip_id", tripId)

  const customPool: DayStopOption[] = (customRows ?? [])
    .filter((cs) => !OVERNIGHT_EXCLUDE.test(cs.location_name ?? ""))
    .map((cs) => ({
      id: cs.id,
      sourceType: "custom" as const,
      name: cs.location_name,
      latitude: Number(cs.latitude),
      longitude: Number(cs.longitude),
      distanceFromStartKm:
        cs.distance_from_start_km ??
        calculateDistance(startLat, startLng, Number(cs.latitude), Number(cs.longitude)),
      customStopId: cs.id,
    }))

  console.log("[organizeStopsByDay] pools loaded", {
    verified: verifiedPool.length,
    custom: customPool.length,
    days: userDays,
    kmPerDay,
  })

  // ── Per-day assignment ───────────────────────────────────────────────────────
  const byProximity = (target: number) => (a: DayStopOption, b: DayStopOption) =>
    Math.abs(a.distanceFromStartKm - target) - Math.abs(b.distanceFromStartKm - target)

  const dedupByName = (stops: DayStopOption[]): DayStopOption[] => {
    const seen = new Map<string, DayStopOption>()
    for (const s of stops) {
      const key = s.name.toLowerCase().trim()
      if (!seen.has(key)) seen.set(key, s)
    }
    return Array.from(seen.values())
  }

  // Lock only selected overnights (dayOrder 1) from reuse.
  const selectedIds = new Set<string>()

  // Collect new Google Places stops that need to be stored in custom_stops.
  const newCustomStopsToStore: Array<{
    trip_id: string
    location_name: string
    latitude: string
    longitude: string
    place_type: string
    distance_from_start_km: number
    day_index: number
  }> = []
  const storedCustomNames = new Set(customPool.map((c) => c.name.toLowerCase().trim()))

  const dayOptions: Array<{ dayNumber: number; targetKm: number; options: DayStopOption[] }> = []

  for (let day = 1; day <= userDays; day++) {
    const targetKm = kmPerDay * day
    // Window: 55% behind → 45% ahead of the target km mark.
    const windowMin = targetKm - kmPerDay * 0.55
    const windowMax = targetKm + kmPerDay * 0.45

    const inWindow = (s: DayStopOption) =>
      s.distanceFromStartKm >= windowMin && s.distanceFromStartKm <= windowMax

    const verifiedInWindow = dedupByName(
      verifiedPool.filter(inWindow).filter((s) => !selectedIds.has(s.id)).sort(byProximity(targetKm))
    )
    const customInWindow = dedupByName(
      customPool.filter(inWindow).filter((s) => !selectedIds.has(s.id)).sort(byProximity(targetKm))
    )

    // Merge: verified first, then custom stops from broad sweep.
    let options = dedupByName([...verifiedInWindow, ...customInWindow]).slice(0, 3)

    // If still fewer than 3, do a targeted Google Places search at the day's target location.
    if (options.length < 3 && googleApiKey) {
      let targetPoint: { lat: number; lng: number }
      if (hasPolyline) {
        targetPoint = samplePolylineAtKm(targetKm, polyline, cumTable)
      } else {
        const frac = Math.min(1, targetKm / totalDistanceKm)
        targetPoint = {
          lat: startLat + (destLat - startLat) * frac,
          lng: startLng + (destLng - startLng) * frac,
        }
      }

      // Search radius: 30 km standard; expand to 50 km for remote routes.
      const searchRadius = isRemoteRoute ? 50_000 : 30_000

      const gPlaces = await searchGooglePlacesForDay(
        targetPoint.lat,
        targetPoint.lng,
        searchRadius,
        googleApiKey,
        hasPolyline ? polyline : [],
        hasPolyline ? cumTable : [],
        maxLateralKm,
      )

      // Only add places that aren't already selected and aren't duplicates by name.
      const existingNames = new Set(options.map((o) => o.name.toLowerCase().trim()))
      for (const gp of gPlaces) {
        if (options.length >= 3) break
        const key = gp.name.toLowerCase().trim()
        if (existingNames.has(key) || selectedIds.has(gp.id)) continue
        existingNames.add(key)
        options.push(gp)

        // Queue for storage in custom_stops if not already there.
        if (!storedCustomNames.has(key)) {
          storedCustomNames.add(key)
          newCustomStopsToStore.push({
            trip_id: tripId,
            location_name: gp.name,
            latitude: String(gp.latitude),
            longitude: String(gp.longitude),
            place_type: "campground",
            distance_from_start_km: gp.distanceFromStartKm,
            day_index: day - 1,
          })
        }
      }
    }

    // If still fewer than 2 with a very sparse route, expand window and retry from existing pools.
    if (options.length < 2) {
      const expandedMin = targetKm - kmPerDay * 1.1
      const expandedMax = targetKm + kmPerDay * 0.9
      const inExpanded = (s: DayStopOption) =>
        s.distanceFromStartKm >= expandedMin && s.distanceFromStartKm <= expandedMax
      const expandedVerified = verifiedPool.filter(inExpanded).sort(byProximity(targetKm))
      const expandedCustom = customPool.filter(inExpanded).sort(byProximity(targetKm))
      const allExpanded = dedupByName([...expandedVerified, ...expandedCustom])
      const extra = allExpanded.filter(
        (s) => !options.some((o) => o.id === s.id) && !selectedIds.has(s.id)
      )
      options = dedupByName([...options, ...extra]).slice(0, 3)
    }

    console.log("[organizeStopsByDay] day", day, {
      targetKm: Math.round(targetKm),
      options: options.map((o) => ({
        name: o.name,
        source: o.sourceType,
        dist: Math.round(o.distanceFromStartKm),
      })),
    })

    dayOptions.push({ dayNumber: day, targetKm, options })

    // Lock the selected (first) overnight stop.
    if (options.length > 0) selectedIds.add(options[0].id)
  }

  // Persist any newly fetched Google Places stops into custom_stops.
  if (newCustomStopsToStore.length > 0) {
    await supabaseAdmin.from("custom_stops").insert(newCustomStopsToStore).throwOnError()
  }

  // ── Write itinerary ─────────────────────────────────────────────────────────
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
    const dayStopsJson = day.options.map((opt, i) => ({
      id: opt.id,
      name: opt.name,
      latitude: opt.latitude,
      longitude: opt.longitude,
      distance_from_start_km: opt.distanceFromStartKm,
      sourceType: opt.sourceType,
      isSelected: i === 0,
      dayOrder: i + 1,
    }))

    stopsByDayJson[`day${day.dayNumber}`] = dayStopsJson

    for (let i = 0; i < day.options.length; i++) {
      const opt = day.options[i]
      itineraryDayRows.push({
        day_number: day.dayNumber,
        day_order: i + 1,
        source_type: opt.sourceType,
        stop_id: opt.stopId ?? null,
        custom_stop_id: opt.customStopId ?? null,
        is_selected: i === 0,
        from_location: day.dayNumber === 1 ? "Start" : `Day ${day.dayNumber - 1}`,
        to_location: opt.name,
        distance_km: Math.round(kmPerDay),
      })
    }
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
    await supabaseAdmin.from("itinerary_days").insert(
      itineraryDayRows.map((row) => ({ ...row, itinerary_id: itineraryRecord.id }))
    )
  }

  console.log("[organizeStopsByDay] complete", {
    tripId,
    days: userDays,
    totalStops: verifiedPool.length + customPool.length,
    newGooglePlaces: newCustomStopsToStore.length,
    optionsPerDay: dayOptions.map((d) => d.options.length),
  })
}
