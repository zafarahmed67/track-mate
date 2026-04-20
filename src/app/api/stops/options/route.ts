import { supabaseAdmin } from "@/config/supabase"
import { NextRequest, NextResponse } from "next/server"
import { applySuitabilityFilter } from "@/lib/stopSuitabilityFilter"
import type { TripPreferences } from "@/lib/stopSuitabilityFilter"
import {
  decodePolyline,
  buildCumulativeDistanceTable,
  projectPointOntoPolyline,
  samplePolylineAtKm,
} from "@/lib/routePolyline"
import type { PolylinePoint } from "@/lib/routePolyline"
import { env } from "@/config/env.config"
import { getCorridorsFromStops, calculateDistance as calcDistance } from "@/lib/corridorUtils"

interface FuelStationOption {
  id: string
  name: string
  lat: number
  lng: number
  address: string
  rating?: number
  isOpenNow?: boolean
  distanceFromStartKm: number
}

interface RouteStopCandidate {
  id: string
  location_name: string
  latitude: string | number
  longitude: string | number
  corridor?: string | null
  state?: string
  region?: string
  route_type?: string
  stay_type?: string
  pet_friendly?: string
  water?: string
  cost_band?: string
  tier?: string
  is_verified: boolean
  is_alternative?: boolean
  distance_from_start_km: number
  distance_from_dest_km: number
  lateral_km?: number
  is_remote_area?: boolean
  source?: "database" | "google_places"
  is_recommended?: boolean
}

interface GoogleDirectionsRoute {
  summary?: string
  overview_polyline?: { points: string }
  waypoint_order?: number[]
  legs: Array<{
    distance: { value: number }
    duration: { value: number }
  }>
}

interface PlannedSegment {
  startKm: number
  endKm: number
  verifiedStops: RouteStopCandidate[]
  otherStops: RouteStopCandidate[]
  options: RouteStopCandidate[]  // Combined 3 options with recommended flag
  recommendedOption: RouteStopCandidate | null  // The recommended stop for this segment
  fuelSuggestions: FuelStationOption[]
  primaryFuelSuggestion?: FuelStationOption
  isRemote: boolean
  fuelCritical: boolean
  degradedMode: boolean
  fuelDistanceIntoLegKm?: number
  gapFromLastFuelKm?: number
  gapToNextFuelKm?: number
  fuelWarning?: string
  // Overnight anchor — the primary stop picked for this segment.
  // Used to chain day start/end points: anchor of day N = fromLocation of day N+1.
  overnightAnchorName?: string | null
  overnightAnchorLat?: number | null
  overnightAnchorLng?: number | null
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

async function findCorridor(lat1: number, lng1: number, lat2: number, lng2: number): Promise<string> {
  const corridorCenters = await getCorridorsFromStops()

  const corridorNames = Object.keys(corridorCenters)
  if (corridorNames.length === 0) {
    return "Unknown"
  }

  let closestCorridor = corridorNames[0]
  let minDistance = Infinity
  const midLat = (lat1 + lat2) / 2
  const midLng = (lng1 + lng2) / 2

  for (const [name, coords] of Object.entries(corridorCenters)) {
    const distance = calcDistance(midLat, midLng, coords.lat, coords.lng)
    if (distance < minDistance) {
      minDistance = distance
      closestCorridor = name
    }
  }

  return closestCorridor
}

function normalizeCorridorName(value: string | null | undefined): string {
  return (value || "")
    .toLowerCase()
    .replace(/highway|hwy|road|route/g, "")
    .replace(/[^a-z0-9]/g, "")
}

function corridorMatchesStop(stopCorridor: string | null | undefined, detectedCorridor: string): boolean {
  if (!detectedCorridor || detectedCorridor === "Unknown") return true
  if (!stopCorridor) return true

  const detected = normalizeCorridorName(detectedCorridor)
  const stop = normalizeCorridorName(stopCorridor)
  if (!detected || !stop) return true

  return stop === detected || stop.includes(detected) || detected.includes(stop)
}

function buildDirectionsUrl(params: {
  startLat: number
  startLng: number
  destLat: number
  destLng: number
  apiKey: string
  rigType?: string | null
  avoidGravelRoads?: boolean
}) {
  const urlParams = new URLSearchParams({
    origin: `${params.startLat},${params.startLng}`,
    destination: `${params.destLat},${params.destLng}`,
    mode: "driving",
    key: params.apiKey,
  })

  const normalizedRig = (params.rigType || "").toLowerCase()
  if (["caravan", "motorhome", "campervan"].includes(normalizedRig)) {
    urlParams.append("avoid", "ferries")
  }

  if (params.avoidGravelRoads) {
    urlParams.append("alternatives", "true")
  }

  return `https://maps.googleapis.com/maps/api/directions/json?${urlParams.toString()}`
}

function selectBestDirectionsRoute(routes: GoogleDirectionsRoute[], threshold = 1.1) {
  if (routes.length <= 1) {
    return routes[0]
  }

  const sortedByDistance = routes
    .filter((route) => route.legs?.[0]?.distance?.value)
    .slice()
    .sort((a, b) => a.legs[0].distance.value - b.legs[0].distance.value)

  if (sortedByDistance.length === 0) {
    return routes[0]
  }

  const shortestDistance = sortedByDistance[0].legs[0].distance.value

  const highwayPreferred = sortedByDistance.find((route) => {
    const summary = (route.summary || "").toLowerCase()
    const isHighway = summary.includes("highway") || summary.includes("hwy") || summary.includes("freeway") || summary.includes("motorway")
    if (!isHighway) return false

    const ratio = route.legs[0].distance.value / shortestDistance
    return ratio <= threshold
  })

  return highwayPreferred || sortedByDistance[0]
}

function interpolatePoint(lat1: number, lng1: number, lat2: number, lng2: number, fraction: number) {
  return {
    lat: lat1 + (lat2 - lat1) * fraction,
    lng: lng1 + (lng2 - lng1) * fraction,
  }
}

function projectDistanceAlongRouteKm(params: {
  startLat: number
  startLng: number
  destLat: number
  destLng: number
  pointLat: number
  pointLng: number
  totalDistanceKm: number
}) {
  const {
    startLat,
    startLng,
    destLat,
    destLng,
    pointLat,
    pointLng,
    totalDistanceKm,
  } = params

  const effectiveTotalKm = Number.isFinite(totalDistanceKm) && totalDistanceKm > 0
    ? totalDistanceKm
    : calculateDistance(startLat, startLng, destLat, destLng)

  if (!Number.isFinite(effectiveTotalKm) || effectiveTotalKm <= 0) return 0

  // Use an equirectangular projection for stable local vector math.
  const avgLatRad = ((startLat + destLat) / 2) * Math.PI / 180
  const scaleX = Math.cos(avgLatRad)

  const sx = startLng * scaleX
  const sy = startLat
  const dx = destLng * scaleX
  const dy = destLat
  const px = pointLng * scaleX
  const py = pointLat

  const vx = dx - sx
  const vy = dy - sy
  const wx = px - sx
  const wy = py - sy
  const vLenSq = (vx * vx) + (vy * vy)

  if (!Number.isFinite(vLenSq) || vLenSq <= 1e-12) {
    return Math.round(calculateDistance(startLat, startLng, pointLat, pointLng) * 10) / 10
  }

  const tRaw = ((wx * vx) + (wy * vy)) / vLenSq
  const t = clamp(tRaw, 0, 1)

  return Math.round(effectiveTotalKm * t * 10) / 10
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function normalizeStopName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function stopPhysicalKey(stop: RouteStopCandidate) {
  const lat = Number(stop.latitude)
  const lng = Number(stop.longitude)
  const name = normalizeStopName(stop.location_name)
  const coordKey = Number.isFinite(lat) && Number.isFinite(lng)
    ? `${lat.toFixed(3)}:${lng.toFixed(3)}`
    : ""
  const distanceKey = Number.isFinite(stop.distance_from_start_km)
    ? `km:${Math.round(stop.distance_from_start_km)}`
    : ""

  return `${name}|${coordKey}|${distanceKey}`
}

const HARD_FUEL_GAP_KM = env.HARD_FUEL_GAP_KM

function getFuelSafetyConfig(northWeight: number, isRemote: boolean) {
  const riskWeight = clamp(Math.max(northWeight, isRemote ? 0.65 : 0), 0, 1)
  const fuelSafeKm = clamp(230 - riskWeight * 120, 90, 230)
  const leadKm = clamp(45 + riskWeight * 60, 45, 120)

  return { fuelSafeKm, leadKm }
}

/**
 * Merges a short first or last segment into its neighbor and re-splits at the
 * stop nearest to the midpoint of the merged range.
 * Only affects the first and last segments to preserve middle-route logic.
 */
function rebalanceShortEndSegments(
  boundaries: Array<{ startKm: number; endKm: number }>,
  stopDistances: number[],
  minShortKm: number
): Array<{ startKm: number; endKm: number }> {
  if (boundaries.length <= 1) return boundaries

  const result = [...boundaries]

  // Fix short LAST segment first (before index shifts from first-segment fix)
  const lastIdx = result.length - 1
  const lastLen = result[lastIdx].endKm - result[lastIdx].startKm
  if (lastLen < minShortKm && result.length >= 2) {
    const mergedStart = result[lastIdx - 1].startKm
    const mergedEnd = result[lastIdx].endKm
    const idealSplit = mergedStart + (mergedEnd - mergedStart) / 2
    const candidates = stopDistances.filter(d => d > mergedStart && d < mergedEnd)
    const bestSplit = candidates.length > 0
      ? candidates.reduce((best, d) =>
        Math.abs(d - idealSplit) < Math.abs(best - idealSplit) ? d : best,
        candidates[0])
      : idealSplit
    result.splice(lastIdx - 1, 2,
      { startKm: mergedStart, endKm: Math.round(bestSplit * 10) / 10 },
      { startKm: Math.round(bestSplit * 10) / 10, endKm: mergedEnd }
    )
  }

  // Fix short FIRST segment
  const firstLen = result[0].endKm - result[0].startKm
  if (firstLen < minShortKm && result.length >= 2) {
    const mergedStart = result[0].startKm   // always 0
    const mergedEnd = result[1].endKm
    const idealSplit = mergedStart + (mergedEnd - mergedStart) / 2
    const candidates = stopDistances.filter(d => d > mergedStart && d < mergedEnd)
    const bestSplit = candidates.length > 0
      ? candidates.reduce((best, d) =>
        Math.abs(d - idealSplit) < Math.abs(best - idealSplit) ? d : best,
        candidates[0])
      : idealSplit
    result.splice(0, 2,
      { startKm: mergedStart, endKm: Math.round(bestSplit * 10) / 10 },
      { startKm: Math.round(bestSplit * 10) / 10, endKm: mergedEnd }
    )
  }

  return result
}

function buildAdaptiveBoundaries(
  totalDistanceKm: number,
  baseTargetKm: number,
  baseMinKm: number,
  baseMaxKm: number,
  stopDistances: number[],
  northbound: boolean
) {
  const boundaries: Array<{ startKm: number; endKm: number }> = []
  let current = 0
  let guard = 0

  while (current < totalDistanceKm - 5 && guard < 40) {
    guard += 1
    const progress = totalDistanceKm > 0 ? current / totalDistanceKm : 0
    const northWeight = northbound ? clamp((progress - 0.55) * 2.2, 0, 1) : 0

    const targetKm = baseTargetKm - northWeight * 25
    const minKm = clamp(baseMinKm - northWeight * 10, 100, 260)
    const maxKm = clamp(baseMaxKm + northWeight * 40, 220, 380)

    const remaining = totalDistanceKm - current
    if (remaining <= maxKm * 1.15) {
      boundaries.push({ startKm: current, endKm: totalDistanceKm })
      break
    }

    let endKm = current + targetKm
    const windowStart = current + minKm
    const windowEnd = current + maxKm
    const windowStops = stopDistances.filter((d) => d >= windowStart && d <= windowEnd)

    if (windowStops.length > 0) {
      const nearestToTarget = windowStops.reduce((best, value) => {
        if (best === null) return value
        return Math.abs(value - endKm) < Math.abs(best - endKm) ? value : best
      }, null as number | null)
      endKm = clamp(nearestToTarget ?? endKm, windowStart, windowEnd)
    } else {
      const extraStretch = northWeight > 0.2 ? 45 : 30
      endKm = clamp(current + maxKm + extraStretch, current + minKm, totalDistanceKm)
    }

    boundaries.push({ startKm: current, endKm })
    current = endKm
  }

  if (boundaries.length === 0) {
    boundaries.push({ startKm: 0, endKm: totalDistanceKm })
  }

  return boundaries
}

function rankStops(
  stops: RouteStopCandidate[],
  targetKm: number,
  preferredCount: number,
  preferVerified?: boolean
) {
  return stops
    .slice()
    .sort((a, b) => {
      const aDistFromTarget = Math.abs(a.distance_from_start_km - targetKm)
      const bDistFromTarget = Math.abs(b.distance_from_start_km - targetKm)
      // Cap the verified bonus proportionally to distance so a verified stop
      // far from the segment endpoint cannot override a closer non-verified stop.
const aVerifiedBonus = a.is_verified ? -Math.min(80, aDistFromTarget * 0.6) : 0
        const bVerifiedBonus = b.is_verified ? -Math.min(80, bDistFromTarget * 0.6) : 0
      // Penalise stops that overshoot the segment endpoint (past targetKm).
      // Driving further than the boundary means tomorrow's leg shrinks — a 25 km
      // overshoot adds an extra 50 points so in-boundary stops are strongly preferred.
      const aOvershoot = Math.max(0, a.distance_from_start_km - targetKm) * 2
      const bOvershoot = Math.max(0, b.distance_from_start_km - targetKm) * 2
      const aScore = aDistFromTarget + aOvershoot + (a.stay_type ? 0 : 25) + aVerifiedBonus
      const bScore = bDistFromTarget + bOvershoot + (b.stay_type ? 0 : 25) + bVerifiedBonus
      return aScore - bScore
    })
    .slice(0, preferredCount)
}

export async function POST(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
      )
    }

    const body = await req.json()
    const {
      startLat,
      startLng,
      destLat,
      destLng,
      travelPace = "moderate",
      tripId,
      preferredLegKm,
      avoidLongDays,
      preferVerified,
      includeFreeCamps,
      includeAlternatives,
    } = body

    if (!startLat || !startLng || !destLat || !destLng) {
      return NextResponse.json(
        { success: false, error: "coordinates are required" },
        { status: 400 }
      )
    }

    const paceConfig = {
      leisurely: {
        kmPerDay: (env.PACE_LEISURELY_MIN_KM_PER_DAY + env.PACE_LEISURELY_MAX_KM_PER_DAY) / 2,
        minKmPerDay: env.PACE_LEISURELY_MIN_KM_PER_DAY,
        maxKmPerDay: env.PACE_LEISURELY_MAX_KM_PER_DAY,
        hoursPerLeg: env.PACE_LEISURELY_HOURS_PER_LEG,
        minSpacing: env.PACE_LEISURELY_MIN_SPACING,
        maxSpacing: env.PACE_LEISURELY_MAX_SPACING
      },
      moderate: {
        kmPerDay: (env.PACE_MODERATE_MIN_KM_PER_DAY + env.PACE_MODERATE_MAX_KM_PER_DAY) / 2,
        minKmPerDay: env.PACE_MODERATE_MIN_KM_PER_DAY,
        maxKmPerDay: env.PACE_MODERATE_MAX_KM_PER_DAY,
        hoursPerLeg: env.PACE_MODERATE_HOURS_PER_LEG,
        minSpacing: env.PACE_MODERATE_MIN_SPACING,
        maxSpacing: env.PACE_MODERATE_MAX_SPACING
      },
      fast: {
        kmPerDay: (env.PACE_FAST_MIN_KM_PER_DAY + env.PACE_FAST_MAX_KM_PER_DAY) / 2,
        minKmPerDay: env.PACE_FAST_MIN_KM_PER_DAY,
        maxKmPerDay: env.PACE_FAST_MAX_KM_PER_DAY,
        hoursPerLeg: env.PACE_FAST_HOURS_PER_LEG,
        minSpacing: env.PACE_FAST_MIN_SPACING,
        maxSpacing: env.PACE_FAST_MAX_SPACING
      },
    }

    const config = paceConfig[travelPace as keyof typeof paceConfig] || paceConfig.moderate
    const corridor = await findCorridor(startLat, startLng, destLat, destLng)

    // Fetch trip preferences for suitability filtering and route selection (non-fatal if missing)
    let tripPreferences: TripPreferences | null = null
    let requestedTripDays: number | null = null
    if (tripId) {
      const { data: tripData, error: tripError } = await supabaseAdmin
        .from("trips")
        .select("rig_type, rig_length_m, pet_friendly_required, avoid_gravel_roads, stay_preference, budget_preference, end_date, trip_duration_days")
        .eq("id", tripId)
        .single()
      if (!tripError && tripData) {
        tripPreferences = tripData as TripPreferences
        const days = Number((tripData as { trip_duration_days?: number | null }).trip_duration_days ?? 0)
        requestedTripDays = Number.isFinite(days) && days > 0 ? Math.round(days) : null
      }
    }

    const apiKey = process.env.NEXT_PUBLIC_GMAPS_API_KEY
    let drivingInfo: { totalDistanceKm: number; totalDurationMinutes: number } | null = null
    // Decoded polyline from Google Directions — used for accurate stop positioning
    // and fuel probe generation instead of straight-line approximations.
    let routePolyline: PolylinePoint[] | null = null
    let routeCumTable: number[] | null = null

    if (apiKey) {
      try {
        const directionsUrl = buildDirectionsUrl({
          startLat,
          startLng,
          destLat,
          destLng,
          apiKey,
          rigType: tripPreferences?.rig_type,
          avoidGravelRoads: tripPreferences?.avoid_gravel_roads,
        })
        const dirController = new AbortController()
        const dirTimeoutId = setTimeout(() => dirController.abort(), 12000)
        const directionsResponse = await fetch(directionsUrl, { signal: dirController.signal })
        clearTimeout(dirTimeoutId)
        if (!directionsResponse.ok) {
          console.warn(`[directions] HTTP ${directionsResponse.status}, falling back to haversine`)
        } else {
          const directionsData = await directionsResponse.json()
          if (directionsData.status === "OK" && directionsData.routes?.length > 0) {
            const selectedRoute = selectBestDirectionsRoute(directionsData.routes as GoogleDirectionsRoute[])
            const route = selectedRoute?.legs?.[0]
            if (!route) {
              throw new Error("No route leg data returned")
            }
            drivingInfo = {
              totalDistanceKm: route.distance.value / 1000,
              totalDurationMinutes: route.duration.value / 60,
            }
            const encodedPolyline = selectedRoute?.overview_polyline?.points
            if (encodedPolyline) {
              routePolyline = decodePolyline(encodedPolyline)
              routeCumTable = buildCumulativeDistanceTable(routePolyline)
            }
          }
        }
      } catch (err) {
        console.error("Error fetching directions:", err)
      }
    }

    const directDistance = calculateDistance(startLat, startLng, destLat, destLng)

    // Dynamic bounding box: scale buffer with route distance
    // ~1 degree ≈ 111 km, so for 1956 km route we need ~9° buffer
    const bufferDeg = Math.max(2, (directDistance / 111) * 0.3)

    const bounds = {
      minLat: Math.min(startLat, destLat) - bufferDeg,
      maxLat: Math.max(startLat, destLat) + bufferDeg,
      minLng: Math.min(startLng, destLng) - bufferDeg,
      maxLng: Math.max(startLng, destLng) + bufferDeg,
    }

    const { data: stops, error: stopsError } = await supabaseAdmin
      .from("stops")
      .select("*")
      .gte("latitude", bounds.minLat)
      .lte("latitude", bounds.maxLat)
      .gte("longitude", bounds.minLng)
      .lte("longitude", bounds.maxLng)

    if (stopsError) {
      return NextResponse.json(
        { success: false, error: stopsError.message },
        { status: 500 }
      )
    }

    const includeAlternativeStops = includeAlternatives !== false
    let customStops: Array<Record<string, unknown>> = []

    if (includeAlternativeStops && tripId) {
      const { data: customStopsData, error: customStopsError } = await supabaseAdmin
        .from("custom_stops")
        .select("*")
        .eq("trip_id", tripId)

      if (customStopsError) {
        console.error("Error fetching custom stops:", customStopsError)
      } else {
        customStops = (customStopsData || []).map((stop) => ({
          ...stop,
          id: `custom-${String(stop.id)}`,
          corridor: null,
          state: "",
          region: "",
          route_type: String(stop.place_type || "custom"),
          stay_type: "",
          pet_friendly: "",
          water: "",
          cost_band: "",
          tier: "",
          verification_status: "custom",
          is_alternative: true,
        }))
      }
    }

    const allStops = [...(stops || []), ...customStops]

    const routeFiltered = allStops.map((stop) => {
      const lat = typeof stop.latitude === "number" ? stop.latitude : parseFloat(stop.latitude)
      const lng = typeof stop.longitude === "number" ? stop.longitude : parseFloat(stop.longitude)
      const isVerified = ["verified", "custom"].includes(stop.verification_status);

      let distanceFromStartKm: number
      let distanceFromDestKm: number
      let lateralKm: number
      let isBetween: boolean

      if (routePolyline && routeCumTable && routeCumTable.length > 0) {
        // --- Polyline-based projection (accurate for curved routes) ---
        const totalRouteKm = routeCumTable[routeCumTable.length - 1]
        const { distanceFromStartKm: routeDistKm, lateralKm: routeLateralKm } =
          projectPointOntoPolyline(lat, lng, routePolyline, routeCumTable)

        distanceFromStartKm = routeDistKm
        distanceFromDestKm = Math.max(0, totalRouteKm - routeDistKm)
        lateralKm = routeLateralKm

        // Tiered lateral distance thresholds:
        // - Ideal: within env.ROUTE_IDEAL_MAX_KM (10km) - best stops
        // - Acceptable: within env.ROUTE_ACCEPTABLE_MAX_KM (20km) - good alternative
        // - Maximum: within env.ROUTE_MAX_KM (30km) - acceptable in normal conditions
        // - Remote: up to env.ROUTE_REMOTE_MAX_KM (50km) - only when no other options
        // Verified stops get slightly more lenient thresholds than unverified
        const baseThreshold = isVerified ? env.ROUTE_MAX_KM : env.ROUTE_ACCEPTABLE_MAX_KM
        const remoteThreshold = env.ROUTE_REMOTE_MAX_KM

        const tolerance = totalRouteKm * 0.05
        isBetween = lateralKm <= baseThreshold &&
          distanceFromStartKm >= -tolerance &&
          distanceFromStartKm <= totalRouteKm + tolerance

        // Store lateral distance for priority sorting later
        stop.lateral_km = lateralKm
        stop.is_remote_area = lateralKm > env.ROUTE_MAX_KM && lateralKm <= remoteThreshold
      } else {
        // --- Straight-line fallback (no polyline available) ---
        const distFromStart = calculateDistance(startLat, startLng, lat, lng)
        const distFromDest = calculateDistance(destLat, destLng, lat, lng)
        const sumDist = distFromStart + distFromDest
        const isBetweenEllipse = sumDist <= (directDistance + Math.min(config.maxSpacing, 120))

        const avgLatRad = ((startLat + destLat) / 2) * Math.PI / 180
        const scaleX = Math.cos(avgLatRad)
        const vx = (destLng - startLng) * scaleX
        const vy = destLat - startLat
        const wx = (lng - startLng) * scaleX
        const wy = lat - startLat
        const vLenSq = vx * vx + vy * vy
        const tRaw = vLenSq > 1e-12 ? (wx * vx + wy * vy) / vLenSq : 0
        const isForwardOnRoute = tRaw >= -0.05 && tRaw <= 1.05
        const tClamped = clamp(tRaw, 0, 1)
        const projLat = startLat + tClamped * (destLat - startLat)
        const projLng = startLng + tClamped * (destLng - startLng)

        distanceFromStartKm = Math.round(distFromStart * 10) / 10
        distanceFromDestKm = Math.round(distFromDest * 10) / 10
        lateralKm = calculateDistance(lat, lng, projLat, projLng)

        const baseThreshold = isVerified ? env.ROUTE_MAX_KM : env.ROUTE_ACCEPTABLE_MAX_KM
        isBetween = isBetweenEllipse && isForwardOnRoute && lateralKm <= baseThreshold

        stop.lateral_km = lateralKm
        stop.is_remote_area = lateralKm > env.ROUTE_MAX_KM && lateralKm <= env.ROUTE_REMOTE_MAX_KM
      }

      return {
        ...stop,
        distance_from_start_km: Math.round(distanceFromStartKm * 10) / 10,
        distance_from_dest_km: Math.round(distanceFromDestKm * 10) / 10,
        is_between: isBetween,
        is_verified: isVerified,
      }
    }).filter((stop) => stop.is_between)
      .sort((a, b) => a.distance_from_start_km - b.distance_from_start_km)

    // Verified stops (from the stops table) always pass the corridor check — their
    // corridor field often won't match the 6 coarse auto-detected corridors (e.g.
    // "Stuart Highway" vs "Outback"), so filtering them would silently drop real stops.
    const corridorFiltered = routeFiltered.filter((stop) =>
      stop.is_verified || corridorMatchesStop(stop.corridor, corridor)
    )

    const stopsWithDistance = (tripPreferences
      ? applySuitabilityFilter(corridorFiltered, tripPreferences)
      : corridorFiltered) as RouteStopCandidate[]

    const fuelStationMap = new Map<string, FuelStationOption>()

    const segments: PlannedSegment[] = []
    // Tracks stops that have been the primary overnight anchor — these are excluded
    // from being the anchor again on another day, but can still appear as options.
    const anchoredStopIds = new Set<string>()
    const anchoredStopKeys = new Set<string>()

    // Tracks all stops already assigned to a segment's options[] — ensures stops
    // don't bleed into adjacent day segments as duplicated options.
    const assignedOptionIds = new Set<string>()
    const assignedOptionKeys = new Set<string>()

    const totalDistanceKm = drivingInfo?.totalDistanceKm ?? directDistance
    const suggestedDays = Math.max(1, Math.round(totalDistanceKm / config.kmPerDay))

    // Use max km/day from pace config for realistic calculation (not midpoint)
    const paceMaxKmPerDay = config.maxKmPerDay
    const minRequiredDays = Math.max(1, Math.round(totalDistanceKm / paceMaxKmPerDay))

    // Determine final days - respect user choice when possible
    let finalDays = suggestedDays
    let daysAdjusted = false
    let originalDays: number | null = null

    if (requestedTripDays && requestedTripDays > 0) {
      // Use system suggestion (if fewer) OR user's choice (if fewer than system)
      // Never go above user's requested days
      finalDays = Math.min(requestedTripDays, suggestedDays)
      if (finalDays < requestedTripDays && suggestedDays > requestedTripDays) {
        // System wanted more days but user capped it - inform UI
        originalDays = requestedTripDays
        daysAdjusted = true
      }
    }

    // Use finalDays for planning
    const planningDays = finalDays
    const northbound = destLat > startLat
    const latSpan = Math.abs(destLat - startLat)
    const remoteMultiplier = northbound && latSpan > 5 ? 0.75 : 1.0
    const targetLegKm = clamp(
      (preferredLegKm ?? config.kmPerDay) * remoteMultiplier,
      env.LEG_TARGET_MIN_KM,
      avoidLongDays ? env.AVOID_LONG_DAYS_KM : env.DEFAULT_MAX_KM_PER_DAY
    )
    const minLegKm = clamp(targetLegKm - env.LEG_SPACING_KM, env.LEG_MIN_KM, 220)
    const maxLegKm = clamp(
      targetLegKm + env.LEG_SPACING_KM,
      env.LEG_MAX_KM,
      avoidLongDays ? env.LEG_AVOID_LONG_DAYS_ADD_KM + env.AVOID_LONG_DAYS_KM : 450
    )

    // When the polyline is available, stop distances are already accurate driving-km
    // values (from projectPointOntoPolyline). The linear scale factor is only needed
    // as a fallback when we have only the haversine distance.
    const scaledStopsWithDistance: RouteStopCandidate[] = (() => {
      if (routePolyline && routeCumTable) {
        // Polyline path: distances are already in actual driving km — no scaling needed.
        return stopsWithDistance
      }
      // Fallback: scale haversine distances proportionally to actual driving distance.
      const scaleFactor = totalDistanceKm > 0 && directDistance > 0
        ? totalDistanceKm / directDistance
        : 1
      return scaleFactor !== 1
        ? stopsWithDistance.map((s) => ({
          ...s,
          distance_from_start_km: Math.round(s.distance_from_start_km * scaleFactor * 10) / 10,
        }))
        : stopsWithDistance
    })()

    const stopDistances = scaledStopsWithDistance.map((s) => s.distance_from_start_km)

    let boundaries = buildAdaptiveBoundaries(
      totalDistanceKm,
      targetLegKm,
      minLegKm,
      maxLegKm,
      stopDistances,
      northbound
    )

    // Reconcile adaptive boundary count with planned day count.
    // Only override with equal-length segments when the adaptive algorithm is more
    // than 2× off from the user's requested day count. Otherwise keep the adaptive
    // boundaries (which respect stop clusters and remote stretches) and trim/extend.
    if (planningDays > 0 && boundaries.length !== planningDays) {
      const ratio = boundaries.length / planningDays

      if (ratio < 0.5 || ratio > 2.0) {
        // Adaptive result is too far off — fall back to equal split.
        const equalBoundaries: Array<{ startKm: number; endKm: number }> = []
        const segmentLength = totalDistanceKm / planningDays
        for (let i = 0; i < planningDays; i++) {
          const startKm = i * segmentLength
          const endKm = i === planningDays - 1 ? totalDistanceKm : (i + 1) * segmentLength
          equalBoundaries.push({
            startKm: Math.round(startKm * 10) / 10,
            endKm: Math.round(endKm * 10) / 10,
          })
        }
        boundaries = equalBoundaries
      } else if (boundaries.length > planningDays) {
        // Merge the shortest adjacent pair until we reach planningDays.
        while (boundaries.length > planningDays) {
          let minIdx = 0
          let minLen = boundaries[0].endKm - boundaries[0].startKm
          for (let i = 1; i < boundaries.length; i++) {
            const len = boundaries[i].endKm - boundaries[i].startKm
            if (len < minLen) { minLen = len; minIdx = i }
          }
          const mergeWith = minIdx === 0 ? 1 : minIdx - 1
          const lo = Math.min(minIdx, mergeWith)
          const hi = Math.max(minIdx, mergeWith)
          boundaries.splice(lo, 2, {
            startKm: boundaries[lo].startKm,
            endKm: boundaries[hi].endKm,
          })
        }
      } else {
        // Need more days — split the longest segment at the stop nearest to the
        // midpoint so the new boundary lands on an actual overnight location.
        while (boundaries.length < planningDays) {
          let maxIdx = 0
          let maxLen = boundaries[0].endKm - boundaries[0].startKm
          for (let i = 1; i < boundaries.length; i++) {
            const len = boundaries[i].endKm - boundaries[i].startKm
            if (len > maxLen) { maxLen = len; maxIdx = i }
          }
          const { startKm, endKm } = boundaries[maxIdx]
          const idealMid = (startKm + endKm) / 2
          // Snap the split point to the stop nearest to the midpoint that lies
          // strictly inside the segment (neither at the start nor at the end).
          const innerStops = stopDistances.filter(d => d > startKm && d < endKm)
          const snapMid = innerStops.length > 0
            ? innerStops.reduce((best, d) =>
              Math.abs(d - idealMid) < Math.abs(best - idealMid) ? d : best,
              innerStops[0])
            : idealMid
          const mid = Math.round(snapMid * 10) / 10
          boundaries.splice(maxIdx, 1,
            { startKm, endKm: mid },
            { startKm: mid, endKm }
          )
        }
      }
    }

    // Rebalance excessively short first/last segments that survived reconciliation.
    const minShortSegKm = minLegKm * 0.55
    boundaries = rebalanceShortEndSegments(boundaries, stopDistances, minShortSegKm)

    for (let i = 0; i < boundaries.length; i++) {
      const startKm = boundaries[i].startKm
      const endKm = boundaries[i].endKm
      const midKm = (startKm + endKm) / 2
      const progress = totalDistanceKm > 0 ? midKm / totalDistanceKm : 0
      const northWeight = northbound ? clamp((progress - 0.55) * 2.2, 0, 1) : 0

      const MIN_STOPS_PER_SEGMENT = 2
      const TARGET_STOPS_PER_SEGMENT = 3

      const inRange = scaledStopsWithDistance.filter(
        (s) => s.distance_from_start_km >= (startKm - 35) && s.distance_from_start_km <= (endKm + 35)
      )

      const expandedInRange = scaledStopsWithDistance.filter(
        (s) => s.distance_from_start_km >= (startKm - 75) && s.distance_from_start_km <= (endKm + 75)
      )

      // Exclude stops already anchored as primary overnight picks AND stops already
      // assigned to a previous segment's options[] to prevent cross-day bleeding.
      const isUnusedStop = (s: RouteStopCandidate) => {
        const physicalKey = stopPhysicalKey(s)
        return !anchoredStopIds.has(s.id) &&
          !assignedOptionIds.has(s.id) &&
          !anchoredStopKeys.has(physicalKey) &&
          !assignedOptionKeys.has(physicalKey)
      }

      const inRangeUnused = inRange.filter(isUnusedStop)

      const expandedUnused = expandedInRange.filter(isUnusedStop)
      const isForwardEnough = (s: RouteStopCandidate) => s.distance_from_start_km >= (startKm - 20)

      const canIncludeAsOther = (s: RouteStopCandidate) => s.is_verified || includeFreeCamps !== false || s.cost_band !== "Free"

      const nearestUnusedBySegment = rankStops(
        expandedUnused.filter((s) => canIncludeAsOther(s)),
        endKm,
        14,
        preferVerified
      )

      const isFuelStop = (s: RouteStopCandidate) => {
        const routeType = s.route_type?.toLowerCase() || ""
        const stayType = s.stay_type?.toLowerCase() || ""
        return routeType === "fuel" || routeType === "gas_station" || stayType === "fuel" || stayType === "gas_station"
      }
      let verifiedInSegment = rankStops(
        inRangeUnused.filter((s) => s.is_verified && !isFuelStop(s)),
        endKm,
        6,
        preferVerified
      )
      let otherInSegment = rankStops(
        inRangeUnused.filter((s) => !s.is_verified && canIncludeAsOther(s) && !isFuelStop(s)),
        endKm,
        8
      )

      let degradedMode = false

      const totalCandidates = () => verifiedInSegment.length + otherInSegment.length

      const appendCandidates = (candidates: RouteStopCandidate[]) => {
        for (const candidate of candidates) {
          const candidateKey = stopPhysicalKey(candidate)
          const alreadyCandidate = [...verifiedInSegment, ...otherInSegment].some(
            (stop) => stop.id === candidate.id || stopPhysicalKey(stop) === candidateKey
          )
          if (alreadyCandidate) {
            continue
          }
          if (candidate.is_verified) {
            verifiedInSegment.push(candidate)
          } else if (canIncludeAsOther(candidate)) {
            otherInSegment.push(candidate)
          }
          if (totalCandidates() >= TARGET_STOPS_PER_SEGMENT) {
            break
          }
        }
      }

      if (verifiedInSegment.length < 1) {
        const fallbackVerified = rankStops(
          expandedUnused.filter((s) => s.is_verified),
          endKm,
          12,
          preferVerified
        ).filter((s) => !verifiedInSegment.some((v) => v.id === s.id))
        verifiedInSegment = [...verifiedInSegment, ...fallbackVerified].slice(0, 6)
      }

      // Trigger fallback earlier to keep 2-3 options available for each segment.
      if (totalCandidates() < TARGET_STOPS_PER_SEGMENT) {
        appendCandidates(nearestUnusedBySegment)
      }

      if (totalCandidates() < MIN_STOPS_PER_SEGMENT) {
        const nearestGlobalUnused = rankStops(
          scaledStopsWithDistance.filter((s) => isUnusedStop(s) && canIncludeAsOther(s) && isForwardEnough(s)),
          endKm,
          20,
          preferVerified
        )
        appendCandidates(nearestGlobalUnused)
      }

      if (totalCandidates() < MIN_STOPS_PER_SEGMENT) {
        // Prefer stops not yet used as overnight anchors to avoid day-to-day repeats
        const nearestGlobal = rankStops(
          scaledStopsWithDistance.filter((s) => canIncludeAsOther(s) && isUnusedStop(s) && isForwardEnough(s)),
          endKm,
          20,
          preferVerified
        )
        appendCandidates(nearestGlobal)
      }

      if (totalCandidates() === 0) {
        degradedMode = true
        const lookaheadKm = Math.max(220, config.kmPerDay)
        const forwardFallback = rankStops(
          scaledStopsWithDistance.filter(
            (s) =>
              canIncludeAsOther(s) &&
              isUnusedStop(s) &&
              s.distance_from_start_km >= (startKm - 20) &&
              s.distance_from_start_km <= (endKm + lookaheadKm)
          ),
          endKm + lookaheadKm * 0.5,
          3,
          preferVerified
        )

        if (forwardFallback.length > 0) {
          appendCandidates(forwardFallback)
        }

        // Final rescue: if end-of-route segment is still empty, borrow the nearest
        // unanchored stop from adjacent distance bands (slight backtrack allowed).
        if (totalCandidates() === 0) {
          const backtrackKm = Math.max(140, config.kmPerDay * 0.6)
          const nearbyFallback = rankStops(
            scaledStopsWithDistance.filter(
              (s) =>
                canIncludeAsOther(s) &&
                isUnusedStop(s) &&
                s.distance_from_start_km >= (startKm - backtrackKm) &&
                s.distance_from_start_km <= (endKm + Math.max(80, config.kmPerDay * 0.4))
            ),
            endKm,
            2,
            preferVerified
          )

          if (nearbyFallback.length > 0) {
            appendCandidates(nearbyFallback)
          }
        }

        if (totalCandidates() === 0) {
          // Still no viable forward candidates in this corridor.
          verifiedInSegment = []
          otherInSegment = []
        }
      }

      if (verifiedInSegment.length > 6) {
        verifiedInSegment = verifiedInSegment.slice(0, 6)
      }
      if (otherInSegment.length > 8) {
        otherInSegment = otherInSegment.slice(0, 8)
      }

      // Select the overnight anchor by competing ALL candidates (verified + Google
      // Places) through the same scoring formula used in rankStops.  This allows a
      // nearby Google Places stop to win over a verified stop that is far from the
      // segment endpoint — "prefer verified" still applies as a bonus, but a verified
      // stop 100+ km from the target will lose to an unverified stop 20 km away.
      const isGasStation = (s: RouteStopCandidate) => {
        const routeType = s.route_type?.toLowerCase() || ""
        const stayType = s.stay_type?.toLowerCase() || ""
        return routeType === "fuel" || routeType === "gas_station" || stayType === "fuel" || stayType === "gas_station"
      }
      const allAnchorCandidates = [...verifiedInSegment, ...otherInSegment].filter(s => !isGasStation(s))
      const anchorScore = (s: RouteStopCandidate) => {
        const dist = Math.abs(s.distance_from_start_km - endKm)
        const overshoot = Math.max(0, s.distance_from_start_km - endKm) * 2
        const verifiedBonus = s.is_verified ? -Math.min(80, dist * 0.6) : 0
        const stayTypePenalty = s.stay_type ? 0 : 25
        return dist + overshoot + stayTypePenalty + verifiedBonus
      }
      const overnightAnchor = allAnchorCandidates.length > 0
        ? allAnchorCandidates.reduce((best, s) => anchorScore(s) < anchorScore(best) ? s : best)
        : null
      if (overnightAnchor) {
        anchoredStopIds.add(overnightAnchor.id)
        anchoredStopKeys.add(stopPhysicalKey(overnightAnchor))
      }

      // Mark the API-selected overnight anchor as the recommendation. DB
      // verification is still exposed separately via is_verified/source.
      const verifiedStopsWithFlag = verifiedInSegment.map((stop) => ({
        ...stop,
        isRecommended: stop.id === overnightAnchor?.id,
        isDbSource: stop.is_verified,
      }))

      const otherStopsWithFlag = otherInSegment.map((stop) => ({
        ...stop,
        isRecommended: stop.id === overnightAnchor?.id,
        isDbSource: false,
      }))

      const segmentDistance = Math.max(0, endKm - startKm)
      const remoteByDistance = segmentDistance > (maxLegKm + 30)
      const remoteByNorth = northbound && northWeight > 0.42
      const remoteBySparseStops = (verifiedStopsWithFlag.length + otherStopsWithFlag.length) < MIN_STOPS_PER_SEGMENT

      const anchorLat = overnightAnchor
        ? parseFloat(String(overnightAnchor.latitude))
        : null
      const anchorLng = overnightAnchor
        ? parseFloat(String(overnightAnchor.longitude))
        : null

      // Build the displayed options around the selected anchor. Route proximity
      // still orders the cards, but the anchor must remain selectable by default.
      const allSegmentStops: RouteStopCandidate[] = [...verifiedInSegment, ...otherInSegment].filter(s => !isFuelStop(s))

      // Sort by blended score: lateral distance (route proximity) + proximity to segment end.
      // Coefficient 0.1 means a stop 100 km earlier needs to be 10 km closer to the route to win.
      // This keeps stops on/near the route while nudging recommendations toward the day's endpoint
      // for more even daily distances.
      const sortedByScore = [...allSegmentStops].sort((a, b) => {
        const aLateral = a.lateral_km ?? 0
        const bLateral = b.lateral_km ?? 0
        const aScore = aLateral + Math.abs(a.distance_from_start_km - endKm) * 0.1
        const bScore = bLateral + Math.abs(b.distance_from_start_km - endKm) * 0.1
        return aScore - bScore
      })

      const topStops = sortedByScore.slice(0, 3)
      const optionStops = overnightAnchor && !topStops.some((stop) => stop.id === overnightAnchor.id)
        ? [overnightAnchor, ...topStops].slice(0, 3)
        : topStops

      const options: RouteStopCandidate[] = optionStops.map((stop) => {
        const isDbStop = stop.is_verified
        return {
          ...stop,
          source: isDbStop ? "database" as const : "google_places" as const,
          is_recommended: stop.id === overnightAnchor?.id,
        }
      })

      if (!overnightAnchor && options.length > 0 && !isFuelStop(options[0])) {
        options[0].is_recommended = true
      }

      // Recommended option is the one with is_recommended = true
      const recommendedOption = options.find(o => o.is_recommended) || null

      // Register all options[] IDs so they are excluded from subsequent segment pools.
      for (const opt of options) {
        assignedOptionIds.add(opt.id)
        assignedOptionKeys.add(stopPhysicalKey(opt))
      }

      segments.push({
        startKm,
        endKm,
        verifiedStops: verifiedInSegment,
        otherStops: otherInSegment,
        options,
        recommendedOption,
        fuelSuggestions: [],
        primaryFuelSuggestion: undefined,
        isRemote: remoteByDistance || remoteByNorth || remoteBySparseStops,
        fuelCritical: false,
        degradedMode,
        overnightAnchorName: overnightAnchor?.location_name ?? null,
        overnightAnchorLat: Number.isFinite(anchorLat) ? anchorLat : null,
        overnightAnchorLng: Number.isFinite(anchorLng) ? anchorLng : null,
      })
    }

    if (apiKey && segments.length > 0) {
      const maxProbes = Math.min(segments.length, Math.max(8, Math.ceil(totalDistanceKm / 200)))
      const segmentProbeIndexes = Array.from(new Set(
        segments.map((_, index) => Math.round(index * (Math.min(segments.length, maxProbes) - 1) / Math.max(1, segments.length - 1)))
      ))

      const uniqueProbePoints: Array<{ lat: number; lng: number }> = []
      const seenKeys = new Set<string>()
      for (const probeIndex of segmentProbeIndexes) {
        const segment = segments[Math.min(probeIndex, segments.length - 1)]
        if (!segment) continue

        const midKm = (segment.startKm + segment.endKm) / 2
        // Use the actual polyline to probe along the real road rather than the
        // straight line (which can be in the ocean for coastal routes).
        const point = routePolyline && routeCumTable
          ? samplePolylineAtKm(midKm, routePolyline, routeCumTable)
          : (() => {
            const fraction = totalDistanceKm > 0 ? Math.min(0.98, Math.max(0.02, midKm / totalDistanceKm)) : 0.5
            return interpolatePoint(startLat, startLng, destLat, destLng, fraction)
          })()
        const pointKey = `${point.lat.toFixed(3)}:${point.lng.toFixed(3)}`

        if (seenKeys.has(pointKey)) continue
        seenKeys.add(pointKey)
        uniqueProbePoints.push({ lat: point.lat, lng: point.lng })
      }

      const fuelFetchPromises = uniqueProbePoints.map(async ({ lat, lng }) => {
        try {
          const fuelUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${env.FUEL_STATION_SEARCH_RADIUS}&type=gas_station&key=${apiKey}`
          const fuelResponse = await fetch(fuelUrl)
          const fuelData = await fuelResponse.json()

          const newStations: FuelStationOption[] = []
          if (fuelData.results) {
            for (const station of fuelData.results.slice(0, 8) as Array<{
              place_id?: string
              name: string
              geometry: { location: { lat: number; lng: number } }
              vicinity?: string
              rating?: number
              opening_hours?: { open_now?: boolean }
            }>) {
              const stationLat = station.geometry.location.lat
              const stationLng = station.geometry.location.lng
              const key = station.place_id || `${stationLat.toFixed(3)}:${stationLng.toFixed(3)}`
              const distanceFromStartKm = routePolyline && routeCumTable
                ? projectPointOntoPolyline(stationLat, stationLng, routePolyline, routeCumTable).distanceFromStartKm
                : projectDistanceAlongRouteKm({
                  startLat, startLng, destLat, destLng,
                  pointLat: stationLat, pointLng: stationLng,
                  totalDistanceKm,
                })

              newStations.push({
                id: key,
                name: station.name,
                lat: stationLat,
                lng: stationLng,
                address: station.vicinity || "",
                rating: station.rating,
                isOpenNow: station.opening_hours?.open_now,
                distanceFromStartKm,
              })
            }
          }
          return newStations
        } catch (err) {
          console.error("Error fetching route fuel probe:", err)
          return [] as FuelStationOption[]
        }
      })

      const allInitialStations = await Promise.all(fuelFetchPromises)
      for (const stations of allInitialStations.flat()) {
        fuelStationMap.set(stations.id, stations)
      }

      const allFuelStations = Array.from(fuelStationMap.values()).sort(
        (a, b) => a.distanceFromStartKm - b.distanceFromStartKm
      )

      // Assign each fuel station to exactly one segment to prevent the same
      // station from repeating in adjacent days.  We use strict half-open intervals:
      // a station belongs to segment i if startKm[i] <= stationKm < endKm[i]
      // (last segment is closed on both ends).  Ties go to the segment whose
      // targetFuelKm is closest.
      const stationOwner = new Map<string, number>()
      for (const station of allFuelStations) {
        let bestIdx = -1
        let bestDelta = Infinity
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i]
          const isLast = i === segments.length - 1
          const inInterval = isLast
            ? station.distanceFromStartKm >= seg.startKm && station.distanceFromStartKm <= seg.endKm
            : station.distanceFromStartKm >= seg.startKm && station.distanceFromStartKm < seg.endKm
          if (!inInterval) continue
          const midKm = (seg.startKm + seg.endKm) / 2
          const delta = Math.abs(station.distanceFromStartKm - midKm)
          if (delta < bestDelta) { bestDelta = delta; bestIdx = i }
        }
        // Station falls outside all segment ranges (before start or after end):
        // assign to the nearest segment as a forward-lookahead fallback.
        if (bestIdx < 0) {
          for (let i = 0; i < segments.length; i++) {
            const delta = Math.abs(station.distanceFromStartKm - segments[i].endKm)
            if (delta < bestDelta) { bestDelta = delta; bestIdx = i }
          }
        }
        if (bestIdx >= 0) stationOwner.set(station.id, bestIdx)
      }

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i]
        const segmentDistance = Math.max(0, segment.endKm - segment.startKm)
        const midKm = (segment.startKm + segment.endKm) / 2
        const progress = totalDistanceKm > 0 ? midKm / totalDistanceKm : 0
        const northWeight = northbound ? clamp((progress - 0.55) * 2.2, 0, 1) : 0
        const { fuelSafeKm, leadKm } = getFuelSafetyConfig(northWeight, segment.isRemote)
        const targetFuelKm = clamp(segment.endKm - leadKm, segment.startKm + 15, segment.endKm - 10)

        // Only include stations assigned to this segment (no cross-day repeats).
        const ownedStations = allFuelStations.filter((s) => stationOwner.get(s.id) === i)

        const rankedFuel = ownedStations
          .slice()
          .sort((a, b) => {
            const aPenalty = a.isOpenNow === false ? 20 : 0
            const bPenalty = b.isOpenNow === false ? 20 : 0
            const aScore = Math.abs(a.distanceFromStartKm - targetFuelKm) + aPenalty
            const bScore = Math.abs(b.distanceFromStartKm - targetFuelKm) + bPenalty
            return aScore - bScore
          })
          .slice(0, 3)

        // Forward-only lookahead: if this segment has no owned station, look for
        // an unowned station strictly within this segment's km range.
        // We never fall back to globally sorted allFuelStations without an interval
        // check — that caused the same station to repeat across multiple days.
        const fallbackFuel = rankedFuel.length === 0
          ? allFuelStations
            .filter((s) => {
              // Must be within this segment (no cross-day re-use)
              if (s.distanceFromStartKm < segment.startKm || s.distanceFromStartKm > segment.endKm + 20) return false
              // Prefer unowned stations; owned-by-other stations only as last resort
              const owner = stationOwner.get(s.id)
              return owner === undefined || owner === i
            })
            .sort((a, b) => Math.abs(a.distanceFromStartKm - targetFuelKm) - Math.abs(b.distanceFromStartKm - targetFuelKm))
            .slice(0, 2)
          : []

        segment.fuelSuggestions = rankedFuel.length > 0 ? rankedFuel : fallbackFuel
        segment.primaryFuelSuggestion = segment.fuelSuggestions[0]
        segment.fuelCritical = segment.isRemote || segmentDistance >= fuelSafeKm || segment.fuelSuggestions.length === 0
      }

      const unfueledSegments = segments.filter((s) => s.fuelSuggestions.length === 0)
      if (unfueledSegments.length > 0) {
        const uniqueProbePoints: Array<{ lat: number; lng: number; key: string }> = []
        const probedMidpoints = new Set<string>()

        for (const segment of unfueledSegments) {
          const midKm = (segment.startKm + segment.endKm) / 2
          // Use polyline sampling so gap-fill probes are on the actual road.
          const point = routePolyline && routeCumTable
            ? samplePolylineAtKm(midKm, routePolyline, routeCumTable)
            : (() => {
              const fraction = totalDistanceKm > 0 ? Math.min(0.98, Math.max(0.02, midKm / totalDistanceKm)) : 0.5
              return interpolatePoint(startLat, startLng, destLat, destLng, fraction)
            })()
          const midpointKey = `${point.lat.toFixed(3)}:${point.lng.toFixed(3)}`

          if (probedMidpoints.has(midpointKey)) continue
          probedMidpoints.add(midpointKey)
          uniqueProbePoints.push({ lat: point.lat, lng: point.lng, key: midpointKey })
        }

        const fuelFetchPromises = uniqueProbePoints.map(async ({ lat, lng }) => {
          try {
            const fuelUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${env.FUEL_STATION_SEARCH_RADIUS}&type=gas_station&key=${apiKey}`
            const fuelController = new AbortController()
            const timeoutId = setTimeout(() => fuelController.abort(), 8000)
            const fuelResponse = await fetch(fuelUrl, { signal: fuelController.signal })
            clearTimeout(timeoutId)
            if (!fuelResponse.ok) {
              console.warn(`[fuel] HTTP error ${fuelResponse.status} for probe ${lat},${lng}`)
              return []
            }
            const fuelData = await fuelResponse.json()

            const newStations: FuelStationOption[] = []
            if (fuelData.results) {
              for (const station of fuelData.results.slice(0, 8) as Array<{
                place_id?: string
                name: string
                geometry: { location: { lat: number; lng: number } }
                vicinity?: string
                rating?: number
                opening_hours?: { open_now?: boolean }
              }>) {
                const stationLat = station.geometry.location.lat
                const stationLng = station.geometry.location.lng
                const key = station.place_id || `${stationLat.toFixed(3)}:${stationLng.toFixed(3)}`
                const distanceFromStartKm = routePolyline && routeCumTable
                  ? projectPointOntoPolyline(stationLat, stationLng, routePolyline, routeCumTable).distanceFromStartKm
                  : projectDistanceAlongRouteKm({
                    startLat, startLng, destLat, destLng,
                    pointLat: stationLat, pointLng: stationLng,
                    totalDistanceKm,
                  })

                newStations.push({
                  id: key,
                  name: station.name,
                  lat: stationLat,
                  lng: stationLng,
                  address: station.vicinity || "",
                  rating: station.rating,
                  isOpenNow: station.opening_hours?.open_now,
                  distanceFromStartKm,
                })
              }
            }
            return newStations
          } catch (err) {
            console.error("Error fetching gap-filling fuel probe:", err)
            return [] as FuelStationOption[]
          }
        })

        const allNewStations = await Promise.all(fuelFetchPromises)
        for (const stations of allNewStations.flat()) {
          fuelStationMap.set(stations.id, stations)
        }

        const updatedFuelStations = Array.from(fuelStationMap.values()).sort(
          (a, b) => a.distanceFromStartKm - b.distanceFromStartKm
        )

        // Re-run ownership assignment with the expanded station list so that
        // newly discovered stations also don't repeat across segments.
        const updatedOwner = new Map<string, number>()
        for (const station of updatedFuelStations) {
          let bestIdx = -1
          let bestDelta = Infinity
          for (let i = 0; i < segments.length; i++) {
            const seg = segments[i]
            const isLast = i === segments.length - 1
            const inInterval = isLast
              ? station.distanceFromStartKm >= seg.startKm && station.distanceFromStartKm <= seg.endKm
              : station.distanceFromStartKm >= seg.startKm && station.distanceFromStartKm < seg.endKm
            if (!inInterval) continue
            const midKm2 = (seg.startKm + seg.endKm) / 2
            const delta = Math.abs(station.distanceFromStartKm - midKm2)
            if (delta < bestDelta) { bestDelta = delta; bestIdx = i }
          }
          if (bestIdx < 0) {
            for (let i = 0; i < segments.length; i++) {
              const delta = Math.abs(station.distanceFromStartKm - segments[i].endKm)
              if (delta < bestDelta) { bestDelta = delta; bestIdx = i }
            }
          }
          if (bestIdx >= 0) updatedOwner.set(station.id, bestIdx)
        }

        for (const segment of unfueledSegments) {
          const segIdx = segments.indexOf(segment)
          const segmentDistance = Math.max(0, segment.endKm - segment.startKm)
          const midKm = (segment.startKm + segment.endKm) / 2
          const progress = totalDistanceKm > 0 ? midKm / totalDistanceKm : 0
          const northWeight = northbound ? clamp((progress - 0.55) * 2.2, 0, 1) : 0
          const { fuelSafeKm, leadKm } = getFuelSafetyConfig(northWeight, segment.isRemote)
          const targetFuelKm = clamp(segment.endKm - leadKm, segment.startKm + 15, segment.endKm - 10)

          const ownedStations = updatedFuelStations.filter((s) => updatedOwner.get(s.id) === segIdx)

          const rankedFuel = ownedStations
            .slice()
            .sort((a, b) => {
              const aPenalty = a.isOpenNow === false ? 20 : 0
              const bPenalty = b.isOpenNow === false ? 20 : 0
              const aScore = Math.abs(a.distanceFromStartKm - targetFuelKm) + aPenalty
              const bScore = Math.abs(b.distanceFromStartKm - targetFuelKm) + bPenalty
              return aScore - bScore
            })
            .slice(0, 3)

          const fallbackFuel = rankedFuel.length === 0
            ? updatedFuelStations
              .filter((s) => {
                if (s.distanceFromStartKm < segment.startKm || s.distanceFromStartKm > segment.endKm + 20) return false
                const owner = updatedOwner.get(s.id)
                return owner === undefined || owner === segIdx
              })
              .sort((a, b) => Math.abs(a.distanceFromStartKm - targetFuelKm) - Math.abs(b.distanceFromStartKm - targetFuelKm))
              .slice(0, 2)
            : []

          segment.fuelSuggestions = rankedFuel.length > 0 ? rankedFuel : fallbackFuel
          segment.primaryFuelSuggestion = segment.fuelSuggestions[0]
          segment.fuelCritical = (segment.isRemote && segmentDistance >= fuelSafeKm * 0.6)
            || segmentDistance >= fuelSafeKm
            || segment.fuelSuggestions.length === 0
        }
      }

      // Second pass: calculate fuel gaps between consecutive segments
      let lastFuelKm: number | null = null
      const fuelKmPositions: number[] = segments
        .map((s) => s.primaryFuelSuggestion?.distanceFromStartKm)
        .filter((km): km is number => km !== undefined)

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i]
        const baselineCritical = Boolean(segment.fuelCritical)
        const progress = totalDistanceKm > 0 ? (segment.startKm + segment.endKm) / 2 / totalDistanceKm : 0
        const northWeight = northbound ? clamp((progress - 0.55) * 2.2, 0, 1) : 0
        const { fuelSafeKm } = getFuelSafetyConfig(northWeight, segment.isRemote)

        if (segment.primaryFuelSuggestion) {
          const currentFuelKm = segment.primaryFuelSuggestion.distanceFromStartKm
          segment.fuelDistanceIntoLegKm = Math.round(Math.max(0, currentFuelKm - segment.startKm))

          if (lastFuelKm !== null) {
            segment.gapFromLastFuelKm = Math.round(currentFuelKm - lastFuelKm)
          }

          const nextFuel = fuelKmPositions.find((km) => km > currentFuelKm)
          segment.gapToNextFuelKm = nextFuel !== undefined ? Math.round(nextFuel - currentFuelKm) : undefined

          const parts: string[] = []
          let gapBasedCritical = false

          if (segment.gapFromLastFuelKm !== undefined) {
            if (segment.gapFromLastFuelKm > HARD_FUEL_GAP_KM) {
              parts.push(`CRITICAL ${segment.gapFromLastFuelKm} km since last fuel — DANGEROUS GAP`)
              gapBasedCritical = true
            } else if (segment.gapFromLastFuelKm > fuelSafeKm) {
              parts.push(`${segment.gapFromLastFuelKm} km since last fuel — fill up here`)
            } else {
              parts.push(`${segment.gapFromLastFuelKm} km since last fuel`)
            }
          }

          if (segment.gapToNextFuelKm !== undefined) {
            if (segment.gapToNextFuelKm > HARD_FUEL_GAP_KM) {
              parts.push(`CRITICAL next fuel ${segment.gapToNextFuelKm} km away — DANGEROUS GAP`)
              gapBasedCritical = true
            } else if (segment.gapToNextFuelKm > fuelSafeKm) {
              parts.push(`Next fuel ${segment.gapToNextFuelKm} km away — long gap ahead`)
            } else {
              parts.push(`Next fuel ${segment.gapToNextFuelKm} km away`)
            }
          }

          if (segment.fuelSuggestions.length === 0) {
            parts.push("No fuel found for this leg")
          }

          segment.fuelWarning = parts.length > 0 ? parts.join(" • ") : undefined
          segment.fuelCritical = baselineCritical || gapBasedCritical
          lastFuelKm = currentFuelKm
        } else {
          if (lastFuelKm !== null) {
            const gapToLast = Math.round(segment.endKm - lastFuelKm)
            segment.gapFromLastFuelKm = gapToLast
            if (gapToLast > HARD_FUEL_GAP_KM) {
              segment.fuelWarning = `CRITICAL ${gapToLast} km since last fuel — DANGEROUS GAP`
              segment.fuelCritical = baselineCritical || true
            } else if (gapToLast > fuelSafeKm) {
              segment.fuelWarning = `${gapToLast} km since last fuel — long gap since last fuel`
              segment.fuelCritical = baselineCritical || true
            } else {
              segment.fuelWarning = `${gapToLast} km since last fuel`
              segment.fuelCritical = baselineCritical
            }
          } else {
            segment.fuelWarning = "No fuel data available for this section"
            segment.fuelCritical = baselineCritical
          }
        }
      }

      const degradedSegments = segments.filter((segment) => segment.degradedMode).length

      return NextResponse.json({
        success: true,
        options: stopsWithDistance.slice(0, 50).map((stop) => ({
          id: stop.id,
          location_name: stop.location_name,
          latitude: stop.latitude,
          longitude: stop.longitude,
          state: stop.state || "",
          region: stop.region || "",
          route_type: stop.route_type || "",
          stay_type: stop.stay_type || "",
          pet_friendly: stop.pet_friendly || "",
          water: stop.water || "",
          cost_band: stop.cost_band || "",
          tier: stop.tier || "",
          distance_from_start_km: stop.distance_from_start_km,
          is_verified: stop.is_verified,
          is_alternative: Boolean(stop.is_alternative),
        })),
        fuelStations: allFuelStations.slice(0, 20),
        corridor,
        segments,
        drivingInfo,
        paceConfig: config,
        planningMode: degradedSegments > 0 ? "degraded-valid" : "standard",
      })
    }

    const options = stopsWithDistance?.slice(0, 50).map((stop) => ({
      id: stop.id,
      location_name: stop.location_name,
      latitude: stop.latitude,
      longitude: stop.longitude,
      state: stop.state || "",
      region: stop.region || "",
      route_type: stop.route_type || "",
      stay_type: stop.stay_type || "",
      pet_friendly: stop.pet_friendly || "",
      water: stop.water || "",
      cost_band: stop.cost_band || "",
      tier: stop.tier || "",
      distance_from_start_km: stop.distance_from_start_km,
      is_verified: stop.is_verified,
      is_alternative: Boolean(stop.is_alternative),
    })) || []

    return NextResponse.json({
      success: true,
      options,
      fuelStations: Array.from(fuelStationMap.values())
        .sort((a, b) => a.distanceFromStartKm - b.distanceFromStartKm)
        .slice(0, 20),
      corridor,
      segments,
      drivingInfo,
      paceConfig: config,
      planningMode: segments.some((segment) => segment.degradedMode) ? "degraded-valid" : "standard",
      daysAdjustment: daysAdjusted && originalDays ? {
        originalDays,
        adjustedToDays: finalDays,
        reason: `Suggested ${suggestedDays} days but capped at your requested ${originalDays} days.`,
      } : null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
