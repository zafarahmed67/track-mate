import { supabaseAdmin } from "@/config/supabase"
import {
  decodePolyline,
  buildCumulativeDistanceTable,
  samplePolylineAtKm,
  projectPointOntoPolyline,
} from "@/lib/routePolyline"
import { calculateDistance } from "./calculateDistance"
import { env } from "@/config/env.config"
import { PlacesBudget, buildProbeKey, buildPointKey } from "@/lib/placesBudget"
import { logPlacesCall } from "@/lib/placesApiLog"
import {
  findNearby as findNearbyUnverified,
  upsertMany as upsertUnverified,
  isExcludedName,
  PlacesNearbyResult,
  UnverifiedStopRow,
} from "@/lib/unverifiedStopsCache"

export interface GenerateCustomStopResult {
  success: boolean
  stopsGenerated: number
  totalFetched?: number
  afterDedup?: number
  routeDistanceKm?: number
  encodedPolyline?: string
  cacheHits?: number
  cacheMisses?: number
  callsMade?: number
  error?: string
}

interface Candidate {
  unverifiedStopId: string
  placeId: string
  name: string
  latitude: number
  longitude: number
  distanceFromStartKm: number
  lateralKm: number
}

function pickSpacedStops<T extends { distanceFromStartKm: number }>(
  sortedStops: T[],
  minSpacingKm: number,
  maxCount: number,
): T[] {
  const picked: T[] = []
  for (const stop of sortedStops) {
    if (picked.length >= maxCount) break
    const farEnough = picked.every(
      (p) => Math.abs(p.distanceFromStartKm - stop.distanceFromStartKm) >= minSpacingKm,
    )
    if (farEnough) picked.push(stop)
  }
  if (picked.length < Math.min(maxCount, sortedStops.length)) {
    for (const stop of sortedStops) {
      if (picked.length >= maxCount) break
      if (!picked.some((p) => p.distanceFromStartKm === stop.distanceFromStartKm)) {
        picked.push(stop)
      }
    }
  }
  return picked
}

/**
 * Generate intermediate overnight stop candidates along the route.
 *
 * Three-tier lookup, in order:
 *   1) verified `stops` (already loaded by caller into existingStopDistancesKm),
 *   2) global `unverified_stops` cache (cross-trip, keyed by Google place_id),
 *   3) Google Places nearbysearch — only when (1)+(2) leave gaps and the
 *      per-trip PlacesBudget still has headroom.
 *
 * Every Places result is upserted into `unverified_stops` so the next trip
 * can skip the API call entirely.
 *
 * Linking is written into `trip_candidate_stops` (unverified_stop_id, day_index,
 * day_order, distance_from_start_km). The legacy `custom_stops` table is no
 * longer used.
 */
export async function generateCustomStop(
  startLat: number,
  startLng: number,
  destLat: number,
  destLng: number,
  tripId: string,
  tripDurationDays: number,
  existingStopDistancesKm: number[] = [],
  requestedCustomStops = 0,
  budget?: PlacesBudget,
): Promise<GenerateCustomStopResult> {
  if (!supabaseAdmin) {
    return {
      success: false,
      stopsGenerated: 0,
      error: "Database not configured",
    }
  }

  try {
    const safeTripDays = Math.max(1, Math.round(Number(tripDurationDays) || 1))
    const placesBudget = budget ?? new PlacesBudget({ tripDurationDays: safeTripDays })

    const apiKey = process.env.NEXT_PUBLIC_GMAPS_API_KEY
    if (!apiKey) {
      return {
        success: false,
        stopsGenerated: 0,
        error: "Google Maps API key not configured",
      }
    }

    const directDistanceKmForProbes = calculateDistance(startLat, startLng, destLat, destLng)
    const isRemoteRoute = directDistanceKmForProbes > 500 && destLat > startLat
    const MAX_LATERAL_KM = isRemoteRoute ? 50 : 30

    // Fetch the actual road polyline so probe points land on the highway.
    let routePolyline: Array<{ lat: number; lng: number }> | null = null
    let routeCumTable: number[] | null = null
    let encodedPolyline: string | undefined
    try {
      const dirParams = new URLSearchParams({
        origin: `${startLat},${startLng}`,
        destination: `${destLat},${destLng}`,
        mode: "driving",
        key: apiKey,
      })
      const dirRes = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${dirParams}`)
      placesBudget.recordCall("directions")
      logPlacesCall({
        tripId,
        endpoint: "directions",
        source: "generateCustomStop",
      })
      const dirData = await dirRes.json()
      if (dirData.status === "OK" && dirData.routes?.length) {
        const encoded = dirData.routes[0]?.overview_polyline?.points
        if (encoded) {
          encodedPolyline = encoded
          routePolyline = decodePolyline(encoded)
          routeCumTable = buildCumulativeDistanceTable(routePolyline)
        }
      }
    } catch {
      // Straight-line fallback used below
    }

    const baseProbeCount = Math.max(safeTripDays * 2, Math.ceil(directDistanceKmForProbes / 100))
    const probeCount = directDistanceKmForProbes > env.PROBE_DISTANCE_THRESHOLD
      ? Math.min(50, baseProbeCount)
      : Math.min(30, baseProbeCount)
    const totalRouteKm = routeCumTable ? routeCumTable[routeCumTable.length - 1] : directDistanceKmForProbes
    const evenlySpacedFractions = Array.from({ length: probeCount }, (_, i) => (i + 1) / (probeCount + 1))
    const endpointFractions = [0.9, 0.95, 0.98, 1]
    const probeFractions = Array.from(new Set([...evenlySpacedFractions, ...endpointFractions]))
      .filter((fraction) => fraction > 0 && fraction <= 1)
      .sort((a, b) => a - b)

    const probePoints = probeFractions.map((fraction) => {
      if (routePolyline && routeCumTable) {
        return samplePolylineAtKm(fraction * totalRouteKm, routePolyline, routeCumTable)
      }
      return {
        lat: startLat + (destLat - startLat) * fraction,
        lng: startLng + (destLng - startLng) * fraction,
      }
    })

    const searchRadius = env.PROBE_SEARCH_RADIUS

    const overnightSearches: Array<{ type: string; keyword?: string; radius: number }> = [
      { type: "rv_park", radius: searchRadius },
      { type: "campground", radius: searchRadius },
      { type: "rv_park", keyword: "caravan park", radius: searchRadius },
      { type: "rv_park", keyword: "holiday park", radius: searchRadius },
      { type: "rv_park", keyword: "tourist park", radius: searchRadius },
      { type: "rv_park", keyword: "van park", radius: searchRadius },
      { type: "campground", keyword: "free camp", radius: searchRadius },
      { type: "campground", keyword: "bush camp", radius: searchRadius },
      { type: "campground", keyword: "showground", radius: searchRadius },
      { type: "campground", keyword: "roadhouse", radius: searchRadius },
      { type: "campground", keyword: "station stay", radius: searchRadius },
      { type: "campground", keyword: "national park", radius: searchRadius },
      { type: "gas_station", keyword: "truck stop", radius: searchRadius },
    ]

    if (directDistanceKmForProbes > 300) {
      overnightSearches.push(
        { type: "campground", keyword: "council campsite", radius: searchRadius },
        { type: "campground", keyword: "lakeside", radius: searchRadius },
        { type: "campground", keyword: "riverside", radius: searchRadius },
      )
    }

    const seenPlaceIds = new Set<string>()
    const candidates: Candidate[] = []
    let totalFetched = 0

    // Early target: lets the probe loop bail once we have enough candidates
    // even before the per-day balancing pass below recomputes targetCustomStops.
    const earlyRouteDistanceKm = totalRouteKm > 0 ? totalRouteKm : directDistanceKmForProbes
    const earlyTargetCount = requestedCustomStops > 0
      ? requestedCustomStops
      : Math.max(2, Math.min(10, Math.round(earlyRouteDistanceKm / 180)))
    // Headroom factor so we discover enough alternatives for the spacing pass.
    const earlyCandidateCeiling = earlyTargetCount * 4

    /** Process a list of cached/fetched results into Candidate rows. */
    const ingestCacheRows = (rows: UnverifiedStopRow[]) => {
      for (const row of rows) {
        if (seenPlaceIds.has(row.place_id)) continue
        seenPlaceIds.add(row.place_id)
        if (isExcludedName(row.location_name)) continue

        let lateralKm: number
        let routeDistanceFromStartKm: number
        if (routePolyline && routeCumTable) {
          const proj = projectPointOntoPolyline(
            row.latitude,
            row.longitude,
            routePolyline,
            routeCumTable,
          )
          lateralKm = proj.lateralKm
          routeDistanceFromStartKm = proj.distanceFromStartKm
          const totalKm = routeCumTable[routeCumTable.length - 1]
          const tRaw = totalKm > 0 ? proj.distanceFromStartKm / totalKm : 0
          if (tRaw < -0.05 || tRaw > 1.05) continue
        } else {
          const distanceFromStart = calculateDistance(startLat, startLng, row.latitude, row.longitude)
          lateralKm = 0
          routeDistanceFromStartKm = distanceFromStart
        }
        if (lateralKm > MAX_LATERAL_KM) continue
        placesBudget.recordPlace(row.place_id)
        candidates.push({
          unverifiedStopId: row.id,
          placeId: row.place_id,
          name: row.location_name,
          latitude: row.latitude,
          longitude: row.longitude,
          distanceFromStartKm: Math.round(routeDistanceFromStartKm * 10) / 10,
          lateralKm,
        })
      }
    }

    // Per probe: cache-first, then Places (budgeted).
    for (const point of probePoints) {
      // Global early-exit: cache already supplied enough candidates for the trip.
      if (candidates.length >= earlyCandidateCeiling) break

      // 1) cache check (no API).
      const cachedBefore = candidates.length
      const cached = await findNearbyUnverified(point.lat, point.lng, {
        bboxDeg: env.UNVERIFIED_CACHE_BBOX_DEG / 2,
      })
      if (cached.length > 0) placesBudget.noteCacheHit()
      ingestCacheRows(cached)
      const cacheUsefulHere = candidates.length - cachedBefore

      // If the cache supplied a healthy haul near this probe point, skip Places
      // probes here entirely. This is what makes UC3 land at ~0 API calls.
      if (cacheUsefulHere >= env.PROBE_CACHE_SUFFICIENT) {
        placesBudget.markPointSatisfied(buildPointKey(point.lat, point.lng))
        continue
      }

      for (const search of overnightSearches) {
        if (placesBudget.exhausted) break

        const probeKey = buildProbeKey(point.lat, point.lng, search.radius, search.type, search.keyword)
        if (!placesBudget.tryConsume(probeKey, "nearbysearch")) continue

        try {
          const params = new URLSearchParams({
            location: `${point.lat},${point.lng}`,
            radius: String(search.radius),
            type: search.type,
            key: apiKey,
          })
          if (search.keyword) params.set("keyword", search.keyword)

          const response = await fetch(
            `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`,
          )
          const data = await response.json()
          placesBudget.noteCacheMiss()
          logPlacesCall({
            tripId,
            endpoint: "nearbysearch",
            placeType: search.type,
            resultCount: Array.isArray(data?.results) ? data.results.length : 0,
            cacheOutcome: "miss",
            source: "generateCustomStop",
          })

          const results: PlacesNearbyResult[] = Array.isArray(data?.results) ? data.results : []
          totalFetched += results.length

          // Filter out already-seen and excluded; cap per-search results.
          const maxResultsPerSearch = directDistanceKmForProbes > 300 ? 20 : 10
          const fresh = results
            .slice(0, maxResultsPerSearch)
            .filter((p) => p.place_id && !placesBudget.hasSeenPlace(p.place_id))
            .filter((p) => !isExcludedName(p.name ?? ""))

          if (fresh.length === 0) continue

          // Persist into the global cache; this returns rows with stable ids.
          const upserted = await upsertUnverified(fresh, {
            firstSeenTripId: tripId,
            placeType: "campground",
          })
          ingestCacheRows(upserted)
        } catch (error) {
          console.warn(`Failed to search ${search.type} at probe point:`, error)
        }
      }
      if (placesBudget.exhausted) break
    }

    const routeDistanceKm = totalRouteKm > 0 ? totalRouteKm : directDistanceKmForProbes
    const targetCustomStops = requestedCustomStops > 0
      ? requestedCustomStops
      : Math.max(2, Math.min(10, Math.round(routeDistanceKm / 180)))

    const ordered = [...candidates].sort((a, b) => a.distanceFromStartKm - b.distanceFromStartKm)
    const initialSpacingKm = Math.max(
      20,
      Math.ceil(routeDistanceKm / (targetCustomStops + Math.ceil(targetCustomStops * 0.2))),
    )

    const planned = pickSpacedStops(ordered, initialSpacingKm, targetCustomStops)

    // Bounded relaxation passes (replaces the old 4-pass loop).
    if (planned.length < targetCustomStops && candidates.length > planned.length) {
      const selectedKeys = new Set(planned.map((c) => c.placeId))
      const expansions = Math.max(0, placesBudget.maxRadiusExpansions)
      const passSpacings = Array.from({ length: expansions }, (_, i) => {
        const factor = 0.6 - i * 0.2 // 0.6, 0.4, 0.2 ...
        return Math.max(8, Math.ceil(initialSpacingKm * Math.max(0.2, factor)))
      })
      const overlapKmByPass = [60, 25, 15]
      for (let i = 0; i < expansions && planned.length < targetCustomStops; i++) {
        const minSpacing = passSpacings[i]
        const overlap = overlapKmByPass[i] ?? 15
        const filtered = candidates.filter(
          (c) => existingStopDistancesKm.every((d) => Math.abs(c.distanceFromStartKm - d) >= overlap),
        )
        for (const candidate of filtered) {
          if (planned.length >= targetCustomStops) break
          if (selectedKeys.has(candidate.placeId)) continue
          const farEnough = planned.every(
            (p) => Math.abs(p.distanceFromStartKm - candidate.distanceFromStartKm) >= minSpacing,
          )
          if (!farEnough) continue
          planned.push(candidate)
          selectedKeys.add(candidate.placeId)
        }
      }
    }

    // Assign each planned stop to a day bucket.
    const sortedForDayAssign = [...planned].sort(
      (a, b) => a.distanceFromStartKm - b.distanceFromStartKm,
    )
    const totalKmForDays = routeDistanceKm > 0 ? routeDistanceKm : 1
    const kmPerDay = totalKmForDays / safeTripDays
    const dayBuckets: number[] = sortedForDayAssign.map((c) =>
      Math.min(safeTripDays - 1, Math.floor(c.distanceFromStartKm / kmPerDay)),
    )

    const bucketCounts = Array.from({ length: safeTripDays }, () => 0)
    dayBuckets.forEach((d) => {
      bucketCounts[d] = (bucketCounts[d] || 0) + 1
    })

    const filledBuckets = [...dayBuckets]
    for (let day = 0; day < safeTripDays; day++) {
      if (bucketCounts[day] > 0) continue
      const dayCenterKm = (day + 0.5) * kmPerDay
      let bestIdx = -1
      let bestDelta = Infinity
      sortedForDayAssign.forEach((c, idx) => {
        const delta = Math.abs(c.distanceFromStartKm - dayCenterKm)
        if (delta < bestDelta) {
          bestDelta = delta
          bestIdx = idx
        }
      })
      if (bestIdx >= 0) {
        filledBuckets[bestIdx] = day
        bucketCounts[day] = 1
      }
    }

    // Link planned stops onto the trip via trip_candidate_stops (unverified path).
    const linkRows = sortedForDayAssign.map((c, idx) => ({
      trip_id: tripId,
      stop_id: null,
      unverified_stop_id: c.unverifiedStopId,
      source_type: "unverified",
      day_index: filledBuckets[idx],
      day_order: 1,
      is_selected: false,
      distance_from_start_km: c.distanceFromStartKm,
    }))

    let insertedCount = 0
    if (linkRows.length > 0) {
      const { error: linkError, data: linkData } = await supabaseAdmin
        .from("trip_candidate_stops")
        .upsert(linkRows, {
          onConflict: "trip_id,unverified_stop_id",
          ignoreDuplicates: true,
        })
        .select("id")

      if (linkError) {
        return {
          success: false,
          stopsGenerated: 0,
          totalFetched,
          afterDedup: candidates.length,
          error: linkError.message,
        }
      }
      insertedCount = linkData?.length ?? 0
    }

    const { callsMade, cacheHits, cacheMisses } = placesBudget.summary()

    return {
      success: true,
      stopsGenerated: insertedCount,
      totalFetched,
      afterDedup: candidates.length,
      routeDistanceKm,
      encodedPolyline,
      callsMade,
      cacheHits,
      cacheMisses,
    }
  } catch (error) {
    return {
      success: false,
      stopsGenerated: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
