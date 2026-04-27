import { supabaseAdmin } from "@/config/supabase"
import { applySuitabilityFilter } from "@/lib/stopSuitabilityFilter"
import { calculateDistance } from "./calculateDistance"
import {
  decodePolyline,
  buildCumulativeDistanceTable,
  samplePolylineAtKm,
  projectPointOntoPolyline,
  PolylinePoint,
} from "@/lib/routePolyline"
import { env } from "@/config/env.config"
import { PlacesBudget, buildProbeKey } from "@/lib/placesBudget"
import {
  findNearby as findNearbyUnverified,
  upsertMany as upsertUnverified,
  isExcludedName,
  PlacesNearbyResult,
  UnverifiedStopRow,
} from "@/lib/unverifiedStopsCache"

interface DayStopOption {
  unverifiedStopId?: string
  stopId?: string
  sourceType: "verified" | "unverified"
  name: string
  latitude: number
  longitude: number
  distanceFromStartKm: number
}

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
 * Cache-first per-day top-up for overnight stop options. Calls Google Places
 * only when the unverified_stops cache + verified pool can't satisfy the day's
 * target, and only within the trip's PlacesBudget.
 */
async function searchPlacesForDay(
  lat: number,
  lng: number,
  radiusMetres: number,
  apiKey: string,
  polyline: PolylinePoint[],
  cumTable: number[],
  maxLateralKm: number,
  budget: PlacesBudget,
  tripId: string,
  needed: number,
): Promise<UnverifiedStopRow[]> {
  if (needed <= 0) return []
  const collected: UnverifiedStopRow[] = []

  // 1) Cache check.
  const cached = await findNearbyUnverified(lat, lng, {
    bboxDeg: env.UNVERIFIED_CACHE_BBOX_DEG / 2,
  })
  if (cached.length > 0) budget.noteCacheHit()
  for (const row of cached) {
    if (collected.length >= needed) break
    if (isExcludedName(row.location_name)) continue
    if (polyline.length >= 2) {
      const { lateralKm } = projectPointOntoPolyline(row.latitude, row.longitude, polyline, cumTable)
      if (lateralKm > maxLateralKm) continue
    }
    if (budget.hasSeenPlace(row.place_id)) continue
    budget.recordPlace(row.place_id)
    collected.push(row)
  }

  // 2) Places fallback (budgeted).
  for (const search of OVERNIGHT_SEARCHES) {
    if (collected.length >= needed) break
    if (budget.exhausted) break

    const probeKey = buildProbeKey(lat, lng, radiusMetres, search.type, search.keyword)
    if (!budget.tryConsume(probeKey)) continue

    try {
      const params = new URLSearchParams({
        location: `${lat},${lng}`,
        radius: String(radiusMetres),
        type: search.type,
        key: apiKey,
      })
      if (search.keyword) params.set("keyword", search.keyword)

      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`,
      )
      const data = await res.json()
      budget.noteCacheMiss()
      const results: PlacesNearbyResult[] = Array.isArray(data?.results) ? data.results : []
      const fresh = results
        .slice(0, 15)
        .filter((p) => p.place_id && !budget.hasSeenPlace(p.place_id))
        .filter((p) => !isExcludedName(p.name ?? ""))
      if (fresh.length === 0) continue

      const upserted = await upsertUnverified(fresh, {
        firstSeenTripId: tripId,
        placeType: "campground",
      })
      for (const row of upserted) {
        if (collected.length >= needed) break
        if (polyline.length >= 2) {
          const { lateralKm } = projectPointOntoPolyline(row.latitude, row.longitude, polyline, cumTable)
          if (lateralKm > maxLateralKm) continue
        }
        if (budget.hasSeenPlace(row.place_id)) continue
        budget.recordPlace(row.place_id)
        collected.push(row)
      }
    } catch {
      // skip failed search type
    }
  }

  return collected
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
  budget?: PlacesBudget,
): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error("Database not configured")
  }

  const userDays = Math.max(1, Math.round(Number(tripDays) || 1))
  const kmPerDay = totalDistanceKm / userDays
  const placesBudget = budget ?? new PlacesBudget({ tripDurationDays: userDays })

  let polyline: PolylinePoint[] = []
  let cumTable: number[] = []
  if (encodedPolyline) {
    polyline = decodePolyline(encodedPolyline)
    cumTable = buildCumulativeDistanceTable(polyline)
  }
  const hasPolyline = polyline.length >= 2

  const directDistanceKm = calculateDistance(startLat, startLng, destLat, destLng)
  const isRemoteRoute = directDistanceKm > 500 && destLat > startLat
  const maxLateralKm = isRemoteRoute ? 50 : 30

  // Verified pool from trip_candidate_stops + stops join.
  const { data: verifiedRows } = await supabaseAdmin
    .from("trip_candidate_stops")
    .select(
      "id, distance_from_start_km, distance_to_route_km, stops:stops(id, location_name, latitude, longitude, rig_suitability, road_suitability, pet_friendly, stay_type, cost_band, max_rig_length, best_season)",
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
      const stopRaw = vs.stops as unknown as
        | {
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
          }
        | Array<{
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
          }>
        | null
      const stop = Array.isArray(stopRaw) ? stopRaw[0] ?? null : stopRaw
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

  const verifiedPool: DayStopOption[] = filteredVerified.flatMap((vs) => {
    const stop = vs._stop
    if (!stop) return []
    const distFromStart =
      vs.distance_from_start_km ??
      vs.distance_to_route_km ??
      calculateDistance(startLat, startLng, stop.latitude, stop.longitude)
    return [
      {
        stopId: stop.id,
        sourceType: "verified" as const,
        name: stop.location_name,
        latitude: stop.latitude,
        longitude: stop.longitude,
        distanceFromStartKm: distFromStart,
      },
    ]
  })

  // Unverified pool: trip_candidate_stops + unverified_stops join.
  const { data: unverifiedRows } = await supabaseAdmin
    .from("trip_candidate_stops")
    .select(
      "id, distance_from_start_km, unverified_stops:unverified_stops(id, place_id, location_name, latitude, longitude)",
    )
    .eq("trip_id", tripId)
    .eq("source_type", "unverified")

  const unverifiedPool: DayStopOption[] = (unverifiedRows ?? [])
    .flatMap((row) => {
      const usRaw = row.unverified_stops as unknown as
        | {
            id: string
            place_id: string
            location_name: string
            latitude: number
            longitude: number
          }
        | Array<{
            id: string
            place_id: string
            location_name: string
            latitude: number
            longitude: number
          }>
        | null
      const us = Array.isArray(usRaw) ? usRaw[0] ?? null : usRaw
      if (!us) return []
      if (isExcludedName(us.location_name)) return []
      const opt: DayStopOption = {
        unverifiedStopId: us.id,
        sourceType: "unverified",
        name: us.location_name,
        latitude: Number(us.latitude),
        longitude: Number(us.longitude),
        distanceFromStartKm:
          row.distance_from_start_km ??
          calculateDistance(startLat, startLng, Number(us.latitude), Number(us.longitude)),
      }
      return [opt]
    })

  for (const us of unverifiedPool) placesBudget.recordPlace(us.unverifiedStopId)

  console.log("[organizeStopsByDay] pools", {
    verified: verifiedPool.length,
    unverified: unverifiedPool.length,
    days: userDays,
    kmPerDay,
  })

  // Per-day assignment.
  const byProximity = (target: number) => (a: DayStopOption, b: DayStopOption) =>
    Math.abs(a.distanceFromStartKm - target) - Math.abs(b.distanceFromStartKm - target)

  const optionKey = (o: DayStopOption) =>
    o.sourceType === "verified" ? `v:${o.stopId}` : `u:${o.unverifiedStopId}`

  const dedupByName = (stops: DayStopOption[]): DayStopOption[] => {
    const seen = new Map<string, DayStopOption>()
    for (const s of stops) {
      const key = s.name.toLowerCase().trim()
      if (!seen.has(key)) seen.set(key, s)
    }
    return Array.from(seen.values())
  }

  const lockedKeys = new Set<string>()

  // Track new unverified stops we add via per-day Places top-up so we can link
  // them to trip_candidate_stops at the end.
  const newlyDiscovered = new Map<string, UnverifiedStopRow>()

  const optionsPerDayCap = env.MAX_STOP_OPTIONS_PER_DAY
  const dayOptions: Array<{ dayNumber: number; targetKm: number; options: DayStopOption[] }> = []

  for (let day = 1; day <= userDays; day++) {
    const targetKm = kmPerDay * day
    const windowMin = targetKm - kmPerDay * 0.55
    const windowMax = targetKm + kmPerDay * 0.45

    const inWindow = (s: DayStopOption) =>
      s.distanceFromStartKm >= windowMin && s.distanceFromStartKm <= windowMax

    const verifiedInWindow = dedupByName(
      verifiedPool.filter(inWindow).filter((s) => !lockedKeys.has(optionKey(s))).sort(byProximity(targetKm)),
    )
    const unverifiedInWindow = dedupByName(
      unverifiedPool.filter(inWindow).filter((s) => !lockedKeys.has(optionKey(s))).sort(byProximity(targetKm)),
    )

    let options = dedupByName([...verifiedInWindow, ...unverifiedInWindow]).slice(0, optionsPerDayCap)

    // Top-up: cache-first + Places fallback (budget-bound).
    if (options.length < optionsPerDayCap && googleApiKey && !placesBudget.exhausted) {
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
      const searchRadius = isRemoteRoute ? 50_000 : 30_000
      const needed = optionsPerDayCap - options.length

      const fetched = await searchPlacesForDay(
        targetPoint.lat,
        targetPoint.lng,
        searchRadius,
        googleApiKey,
        hasPolyline ? polyline : [],
        hasPolyline ? cumTable : [],
        maxLateralKm,
        placesBudget,
        tripId,
        needed,
      )

      const existingNames = new Set(options.map((o) => o.name.toLowerCase().trim()))
      for (const row of fetched) {
        if (options.length >= optionsPerDayCap) break
        const k = row.location_name.toLowerCase().trim()
        if (existingNames.has(k)) continue
        existingNames.add(k)

        const distFromStart = hasPolyline
          ? projectPointOntoPolyline(row.latitude, row.longitude, polyline, cumTable).distanceFromStartKm
          : calculateDistance(startLat, startLng, row.latitude, row.longitude)

        const opt: DayStopOption = {
          unverifiedStopId: row.id,
          sourceType: "unverified",
          name: row.location_name,
          latitude: row.latitude,
          longitude: row.longitude,
          distanceFromStartKm: distFromStart,
        }
        options.push(opt)
        newlyDiscovered.set(row.id, row)
      }
    }

    // If still very thin, expand window (no API call, just relax filter).
    if (options.length < 2) {
      const expandedMin = targetKm - kmPerDay * 1.1
      const expandedMax = targetKm + kmPerDay * 0.9
      const inExpanded = (s: DayStopOption) =>
        s.distanceFromStartKm >= expandedMin && s.distanceFromStartKm <= expandedMax
      const expandedVerified = verifiedPool.filter(inExpanded).sort(byProximity(targetKm))
      const expandedUnverified = unverifiedPool.filter(inExpanded).sort(byProximity(targetKm))
      const allExpanded = dedupByName([...expandedVerified, ...expandedUnverified])
      const extra = allExpanded.filter(
        (s) => !options.some((o) => optionKey(o) === optionKey(s)) && !lockedKeys.has(optionKey(s)),
      )
      options = dedupByName([...options, ...extra]).slice(0, optionsPerDayCap)
    }

    dayOptions.push({ dayNumber: day, targetKm, options })
    if (options.length > 0) lockedKeys.add(optionKey(options[0]))
  }

  // Persist newly-discovered unverified stops as trip_candidate_stops links so
  // the cross-day Places API call propagates back to the trip.
  if (newlyDiscovered.size > 0) {
    const linkRows = Array.from(newlyDiscovered.values()).map((row) => ({
      trip_id: tripId,
      stop_id: null,
      unverified_stop_id: row.id,
      source_type: "unverified",
    }))
    await supabaseAdmin
      .from("trip_candidate_stops")
      .upsert(linkRows, {
        onConflict: "trip_id,unverified_stop_id",
        ignoreDuplicates: true,
      })
  }

  // Update per-day fields on trip_candidate_stops (single source of truth).
  // Build (trip_id, stop_id|unverified_stop_id) -> {day_index, day_order, is_selected, distance_from_start_km}
  type DayPatch = {
    day_index: number
    day_order: number
    is_selected: boolean
    distance_from_start_km: number
  }
  const verifiedPatches = new Map<string, DayPatch>()
  const unverifiedPatches = new Map<string, DayPatch>()
  for (const day of dayOptions) {
    day.options.forEach((opt, i) => {
      const patch: DayPatch = {
        day_index: day.dayNumber - 1,
        day_order: i + 1,
        is_selected: i === 0,
        distance_from_start_km: opt.distanceFromStartKm,
      }
      if (opt.sourceType === "verified" && opt.stopId) {
        verifiedPatches.set(opt.stopId, patch)
      } else if (opt.sourceType === "unverified" && opt.unverifiedStopId) {
        unverifiedPatches.set(opt.unverifiedStopId, patch)
      }
    })
  }

  await Promise.all([
    ...Array.from(verifiedPatches.entries()).map(([stopId, patch]) =>
      supabaseAdmin!
        .from("trip_candidate_stops")
        .update(patch)
        .eq("trip_id", tripId)
        .eq("stop_id", stopId),
    ),
    ...Array.from(unverifiedPatches.entries()).map(([uid, patch]) =>
      supabaseAdmin!
        .from("trip_candidate_stops")
        .update(patch)
        .eq("trip_id", tripId)
        .eq("unverified_stop_id", uid),
    ),
  ])

  // Trip itinerary versioning + per-day route metadata.
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

  const { data: itineraryRecord, error: itineraryError } = await supabaseAdmin
    .from("trip_itineraries")
    .insert({
      trip_id: tripId,
      version: nextVersion,
      status: "active",
    })
    .select("id")
    .single()

  if (itineraryError) {
    console.error("Failed to create itinerary:", itineraryError)
    return
  }

  if (itineraryRecord) {
    const itineraryDayRows = dayOptions.map((day) => {
      const selected = day.options[0]
      return {
        itinerary_id: itineraryRecord.id,
        day_number: day.dayNumber,
        source_type: selected?.sourceType ?? "verified",
        from_location: day.dayNumber === 1 ? "Start" : `Day ${day.dayNumber - 1}`,
        to_location: selected?.name ?? "",
        distance_km: Math.round(kmPerDay),
      }
    })
    if (itineraryDayRows.length > 0) {
      await supabaseAdmin.from("itinerary_days").insert(itineraryDayRows)
    }
  }

  console.log("[organizeStopsByDay] complete", {
    tripId,
    days: userDays,
    verified: verifiedPool.length,
    unverified: unverifiedPool.length,
    newlyDiscovered: newlyDiscovered.size,
    optionsPerDay: dayOptions.map((d) => d.options.length),
    budget: placesBudget.summary(),
  })
}
