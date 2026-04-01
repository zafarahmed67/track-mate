import { supabaseAdmin } from "@/config/supabase"
import { NextRequest, NextResponse } from "next/server"
import { applySuitabilityFilter } from "@/lib/stopSuitabilityFilter"
import type { TripPreferences } from "@/lib/stopSuitabilityFilter"

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
  latitude: string
  longitude: string
  state?: string
  region?: string
  route_type?: string
  stay_type?: string
  pet_friendly?: string
  water?: string
  cost_band?: string
  tier?: string
  is_verified: boolean
  distance_from_start_km: number
  distance_from_dest_km: number
}

interface PlannedSegment {
  startKm: number
  endKm: number
  verifiedStops: RouteStopCandidate[]
  otherStops: RouteStopCandidate[]
  fuelSuggestions: FuelStationOption[]
  primaryFuelSuggestion?: FuelStationOption
  isRemote: boolean
  fuelCritical: boolean
  degradedMode: boolean
  fuelDistanceIntoLegKm?: number
  gapFromLastFuelKm?: number
  gapToNextFuelKm?: number
  fuelWarning?: string
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

function findCorridor(lat1: number, lng1: number, lat2: number, lng2: number): string {
  const corridors: Record<string, { lat: number; lng: number }> = {
    "Pacific Highway": { lat: -33.8688, lng: 151.2093 },
    "Outback": { lat: -25.2744, lng: 133.7751 },
    "Great Ocean Road": { lat: -38.3405, lng: 142.9790 },
    "Nullarbor": { lat: -31.0000, lng: 129.0000 },
    "Cunningham": { lat: -28.0000, lng: 152.0000 },
    "Bruce": { lat: -19.0000, lng: 146.0000 },
  }

  let closestCorridor = "Unknown"
  let minDistance = Infinity
  const midLat = (lat1 + lat2) / 2
  const midLng = (lng1 + lng2) / 2

  for (const [name, coords] of Object.entries(corridors)) {
    const distance = calculateDistance(midLat, midLng, coords.lat, coords.lng)
    if (distance < minDistance) {
      minDistance = distance
      closestCorridor = name
    }
  }

  return closestCorridor
}

function interpolatePoint(lat1: number, lng1: number, lat2: number, lng2: number, fraction: number) {
  return {
    lat: lat1 + (lat2 - lat1) * fraction,
    lng: lng1 + (lng2 - lng1) * fraction,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

const HARD_FUEL_GAP_KM = 350

function getFuelSafetyConfig(northWeight: number, isRemote: boolean) {
  const riskWeight = clamp(Math.max(northWeight, isRemote ? 0.65 : 0), 0, 1)
  const fuelSafeKm = clamp(230 - riskWeight * 120, 90, 230)
  const leadKm = clamp(45 + riskWeight * 60, 45, 120)

  return { fuelSafeKm, leadKm }
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
  segmentMidKm: number,
  preferredCount: number,
  preferVerified?: boolean
) {
  return stops
    .slice()
    .sort((a, b) => {
      const aVerifiedBonus = preferVerified && a.is_verified ? -50 : 0
      const bVerifiedBonus = preferVerified && b.is_verified ? -50 : 0
      const aScore = Math.abs(a.distance_from_start_km - segmentMidKm) + (a.stay_type ? 0 : 25) + aVerifiedBonus
      const bScore = Math.abs(b.distance_from_start_km - segmentMidKm) + (b.stay_type ? 0 : 25) + bVerifiedBonus
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
    } = body

    if (!startLat || !startLng || !destLat || !destLng) {
      return NextResponse.json(
        { success: false, error: "coordinates are required" },
        { status: 400 }
      )
    }

    const paceConfig = {
      leisurely: { kmPerDay: 150, hoursPerLeg: 2, minSpacing: 80, maxSpacing: 200 },
      moderate: { kmPerDay: 200, hoursPerLeg: 2.5, minSpacing: 120, maxSpacing: 280 },
      fast: { kmPerDay: 300, hoursPerLeg: 3.5, minSpacing: 180, maxSpacing: 400 },
    }

    const config = paceConfig[travelPace as keyof typeof paceConfig] || paceConfig.moderate
    const corridor = findCorridor(startLat, startLng, destLat, destLng)

    const apiKey = process.env.NEXT_PUBLIC_GMAPS_API_KEY
    let drivingInfo: { totalDistanceKm: number; totalDurationMinutes: number } | null = null

    if (apiKey) {
      try {
        const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${startLat},${startLng}&destination=${destLat},${destLng}&key=${apiKey}`
        const directionsResponse = await fetch(directionsUrl)
        const directionsData = await directionsResponse.json()

        if (directionsData.status === "OK" && directionsData.routes[0]) {
          const route = directionsData.routes[0].legs[0]
          drivingInfo = {
            totalDistanceKm: route.distance.value / 1000,
            totalDurationMinutes: route.duration.value / 60,
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

    // Fetch trip preferences for suitability filtering (non-fatal if missing)
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

    const { data: stops, error: stopsError } = await supabaseAdmin
      .from("stops")
      .select("*")
      .gte("latitude", bounds.minLat.toString())
      .lte("latitude", bounds.maxLat.toString())
      .gte("longitude", bounds.minLng.toString())
      .lte("longitude", bounds.maxLng.toString())

    if (stopsError) {
      return NextResponse.json(
        { success: false, error: stopsError.message },
        { status: 500 }
      )
    }

    const routeFiltered = stops?.map((stop) => {
      const lat = parseFloat(stop.latitude)
      const lng = parseFloat(stop.longitude)
      const distFromStart = calculateDistance(startLat, startLng, lat, lng)
      const distFromDest = calculateDistance(destLat, destLng, lat, lng)
      const sumDist = distFromStart + distFromDest
      const isBetween = sumDist <= (directDistance + config.maxSpacing)

      return {
        ...stop,
        distance_from_start_km: Math.round(distFromStart * 10) / 10,
        distance_from_dest_km: Math.round(distFromDest * 10) / 10,
        is_between: isBetween,
        is_verified: stop.verification_status && stop.verification_status !== "custom",
      }
    }).filter((stop) => stop.is_between)
    .sort((a, b) => a.distance_from_start_km - b.distance_from_start_km)

    const stopsWithDistance = (tripPreferences
      ? applySuitabilityFilter(routeFiltered ?? [], tripPreferences)
      : (routeFiltered ?? [])) as RouteStopCandidate[]

    const fuelStationMap = new Map<string, FuelStationOption>()

    const segments: PlannedSegment[] = []
    const usedStopIds = new Set<string>()

    const totalDistanceKm = drivingInfo?.totalDistanceKm ?? directDistance
    const suggestedDays = Math.max(1, Math.round(totalDistanceKm / config.kmPerDay))
    const planningDays = requestedTripDays && requestedTripDays > 0
      ? Math.min(requestedTripDays, suggestedDays)
      : suggestedDays
    const northbound = destLat > startLat
    const latSpan = Math.abs(destLat - startLat)
    const remoteMultiplier = northbound && latSpan > 5 ? 0.75 : 1.0
    const targetLegKm = clamp(
      (preferredLegKm ?? config.kmPerDay) * remoteMultiplier,
      100,
      avoidLongDays ? 280 : 400
    )
    const minLegKm = clamp(targetLegKm - 50, 140, 220)
    const maxLegKm = clamp(
      targetLegKm + 50,
      220,
      avoidLongDays ? 340 : 450
    )
    const stopDistances = stopsWithDistance.map((s) => s.distance_from_start_km)

    let boundaries = buildAdaptiveBoundaries(
      totalDistanceKm,
      targetLegKm,
      minLegKm,
      maxLegKm,
      stopDistances,
      northbound
    )

    // Keep segment/day count aligned with planned days.
    if (planningDays > 0 && boundaries.length !== planningDays) {
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
    }

    for (let i = 0; i < boundaries.length; i++) {
      const startKm = boundaries[i].startKm
      const endKm = boundaries[i].endKm
      const midKm = (startKm + endKm) / 2
      const progress = totalDistanceKm > 0 ? midKm / totalDistanceKm : 0
      const northWeight = northbound ? clamp((progress - 0.55) * 2.2, 0, 1) : 0

      const MIN_STOPS_PER_SEGMENT = 2
      const TARGET_STOPS_PER_SEGMENT = 3

      const inRange = stopsWithDistance.filter(
        (s) => s.distance_from_start_km >= (startKm - 35) && s.distance_from_start_km <= (endKm + 35)
      )

      const expandedInRange = stopsWithDistance.filter(
        (s) => s.distance_from_start_km >= (startKm - 75) && s.distance_from_start_km <= (endKm + 75)
      )

      const inRangeUnused = inRange.filter((s) => !usedStopIds.has(s.id))

      const expandedUnused = expandedInRange.filter((s) => !usedStopIds.has(s.id))

      const canIncludeAsOther = (s: RouteStopCandidate) => s.is_verified || includeFreeCamps || s.cost_band !== "Free"

      const nearestUnusedBySegment = rankStops(
        expandedUnused.filter((s) => canIncludeAsOther(s)),
        midKm,
        14,
        preferVerified
      )

      let verifiedInSegment = rankStops(
        inRangeUnused.filter((s) => s.is_verified),
        midKm,
        6,
        preferVerified
      )
      let otherInSegment = rankStops(
        inRangeUnused.filter((s) => !s.is_verified && canIncludeAsOther(s)),
        midKm,
        8
      )

      let degradedMode = false

      const totalCandidates = () => verifiedInSegment.length + otherInSegment.length

      const appendCandidates = (candidates: RouteStopCandidate[]) => {
        for (const candidate of candidates) {
          if (verifiedInSegment.some((v) => v.id === candidate.id) || otherInSegment.some((o) => o.id === candidate.id)) {
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
          midKm,
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
          stopsWithDistance.filter((s) => !usedStopIds.has(s.id) && canIncludeAsOther(s)),
          midKm,
          20,
          preferVerified
        )
        appendCandidates(nearestGlobalUnused)
      }

      if (totalCandidates() < MIN_STOPS_PER_SEGMENT) {
        const nearestGlobal = rankStops(
          stopsWithDistance.filter((s) => canIncludeAsOther(s)),
          midKm,
          20,
          preferVerified
        )
        appendCandidates(nearestGlobal)
      }

      if (totalCandidates() === 0) {
        degradedMode = true
        otherInSegment = rankStops(stopsWithDistance, midKm, 3)
      }

      if (verifiedInSegment.length > 6) {
        verifiedInSegment = verifiedInSegment.slice(0, 6)
      }
      if (otherInSegment.length > 8) {
        otherInSegment = otherInSegment.slice(0, 8)
      }

      const overnightAnchor = verifiedInSegment[0] || otherInSegment[0]
      if (overnightAnchor) {
        usedStopIds.add(overnightAnchor.id)
      }

      const segmentDistance = Math.max(0, endKm - startKm)
      const remoteByDistance = segmentDistance > (maxLegKm + 30)
      const remoteByNorth = northbound && northWeight > 0.42
      const remoteBySparseStops = (verifiedInSegment.length + otherInSegment.length) < MIN_STOPS_PER_SEGMENT

      segments.push({
        startKm,
        endKm,
        verifiedStops: verifiedInSegment,
        otherStops: otherInSegment,
        fuelSuggestions: [],
        primaryFuelSuggestion: undefined,
        isRemote: remoteByDistance || remoteByNorth || remoteBySparseStops,
        fuelCritical: false,
        degradedMode,
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
        const fraction = totalDistanceKm > 0 ? Math.min(0.98, Math.max(0.02, midKm / totalDistanceKm)) : 0.5
        const point = interpolatePoint(startLat, startLng, destLat, destLng, fraction)
        const pointKey = `${point.lat.toFixed(3)}:${point.lng.toFixed(3)}`

        if (seenKeys.has(pointKey)) continue
        seenKeys.add(pointKey)
        uniqueProbePoints.push({ lat: point.lat, lng: point.lng })
      }

      const fuelFetchPromises = uniqueProbePoints.map(async ({ lat, lng }) => {
        try {
          const fuelUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=30000&type=gas_station&key=${apiKey}`
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
              const distanceFromStartKm = calculateDistance(startLat, startLng, stationLat, stationLng)

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

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i]
        const segmentDistance = Math.max(0, segment.endKm - segment.startKm)
        const midKm = (segment.startKm + segment.endKm) / 2
        const progress = totalDistanceKm > 0 ? midKm / totalDistanceKm : 0
        const northWeight = northbound ? clamp((progress - 0.55) * 2.2, 0, 1) : 0
        const { fuelSafeKm, leadKm } = getFuelSafetyConfig(northWeight, segment.isRemote)
        const targetFuelKm = clamp(segment.endKm - leadKm, segment.startKm + 15, segment.endKm - 10)

        const bandStart = segment.startKm - 15
        const bandEnd = segment.endKm + 20
        const inSegmentBand = allFuelStations.filter(
          (station) => station.distanceFromStartKm >= bandStart && station.distanceFromStartKm <= bandEnd
        )

        const rankedFuel = inSegmentBand
          .slice()
          .sort((a, b) => {
            const aPenalty = a.isOpenNow === false ? 20 : 0
            const bPenalty = b.isOpenNow === false ? 20 : 0
            const aScore = Math.abs(a.distanceFromStartKm - targetFuelKm) + aPenalty
            const bScore = Math.abs(b.distanceFromStartKm - targetFuelKm) + bPenalty
            return aScore - bScore
          })
          .slice(0, 3)

        const extendedBand = allFuelStations.filter(
          (station) => station.distanceFromStartKm >= (segment.startKm - 50) && station.distanceFromStartKm <= (segment.endKm + 50)
        )
        const fallbackFuel = extendedBand
          .slice()
          .sort((a, b) => Math.abs(a.distanceFromStartKm - targetFuelKm) - Math.abs(b.distanceFromStartKm - targetFuelKm))
          .slice(0, 2)

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
          const fraction = totalDistanceKm > 0 ? Math.min(0.98, Math.max(0.02, midKm / totalDistanceKm)) : 0.5
          const point = interpolatePoint(startLat, startLng, destLat, destLng, fraction)
          const midpointKey = `${point.lat.toFixed(3)}:${point.lng.toFixed(3)}`

          if (probedMidpoints.has(midpointKey)) continue
          probedMidpoints.add(midpointKey)
          uniqueProbePoints.push({ lat: point.lat, lng: point.lng, key: midpointKey })
        }

        const fuelFetchPromises = uniqueProbePoints.map(async ({ lat, lng }) => {
          try {
            const fuelUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=30000&type=gas_station&key=${apiKey}`
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
                const distanceFromStartKm = calculateDistance(startLat, startLng, stationLat, stationLng)

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

        for (const segment of unfueledSegments) {
          const segmentDistance = Math.max(0, segment.endKm - segment.startKm)
          const midKm = (segment.startKm + segment.endKm) / 2
          const progress = totalDistanceKm > 0 ? midKm / totalDistanceKm : 0
          const northWeight = northbound ? clamp((progress - 0.55) * 2.2, 0, 1) : 0
          const { fuelSafeKm, leadKm } = getFuelSafetyConfig(northWeight, segment.isRemote)
          const targetFuelKm = clamp(segment.endKm - leadKm, segment.startKm + 15, segment.endKm - 10)

          const bandStart = segment.startKm - 15
          const bandEnd = segment.endKm + 20
          const inSegmentBand = updatedFuelStations.filter(
            (station) => station.distanceFromStartKm >= bandStart && station.distanceFromStartKm <= bandEnd
          )

          const rankedFuel = inSegmentBand
            .slice()
            .sort((a, b) => {
              const aPenalty = a.isOpenNow === false ? 20 : 0
              const bPenalty = b.isOpenNow === false ? 20 : 0
              const aScore = Math.abs(a.distanceFromStartKm - targetFuelKm) + aPenalty
              const bScore = Math.abs(b.distanceFromStartKm - targetFuelKm) + bPenalty
              return aScore - bScore
            })
            .slice(0, 3)

          const extendedBand = updatedFuelStations.filter(
            (station) => station.distanceFromStartKm >= (segment.startKm - 50) && station.distanceFromStartKm <= (segment.endKm + 50)
          )
          const fallbackFuel = extendedBand
            .slice()
            .sort((a, b) => Math.abs(a.distanceFromStartKm - targetFuelKm) - Math.abs(b.distanceFromStartKm - targetFuelKm))
            .slice(0, 2)

          segment.fuelSuggestions = rankedFuel.length > 0 ? rankedFuel : fallbackFuel
          segment.primaryFuelSuggestion = segment.fuelSuggestions[0]
          segment.fuelCritical = segment.isRemote || segmentDistance >= fuelSafeKm || segment.fuelSuggestions.length === 0
        }
      }

      // Second pass: calculate fuel gaps between consecutive segments
      let lastFuelKm: number | null = null
      const fuelKmPositions: number[] = segments
        .map((s) => s.primaryFuelSuggestion?.distanceFromStartKm)
        .filter((km): km is number => km !== undefined)

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i]
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

          if (segment.gapFromLastFuelKm !== undefined) {
            if (segment.gapFromLastFuelKm > HARD_FUEL_GAP_KM) {
              parts.push(`CRITICAL ${segment.gapFromLastFuelKm} km since last fuel — DANGEROUS GAP`)
              segment.fuelCritical = true
            } else if (segment.gapFromLastFuelKm > fuelSafeKm) {
              parts.push(`${segment.gapFromLastFuelKm} km since last fuel — fill up here`)
            } else {
              parts.push(`${segment.gapFromLastFuelKm} km since last fuel`)
            }
          }

          if (segment.gapToNextFuelKm !== undefined) {
            if (segment.gapToNextFuelKm > HARD_FUEL_GAP_KM) {
              parts.push(`CRITICAL next fuel ${segment.gapToNextFuelKm} km away — DANGEROUS GAP`)
              segment.fuelCritical = true
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
          lastFuelKm = currentFuelKm
        } else {
          if (lastFuelKm !== null) {
            const gapToLast = Math.round(segment.endKm - lastFuelKm)
            segment.gapFromLastFuelKm = gapToLast
            if (gapToLast > HARD_FUEL_GAP_KM) {
              segment.fuelWarning = `CRITICAL ${gapToLast} km since last fuel — DANGEROUS GAP`
              segment.fuelCritical = true
            } else if (gapToLast > fuelSafeKm) {
              segment.fuelWarning = `${gapToLast} km since last fuel — fuel-critical leg`
            } else {
              segment.fuelWarning = `${gapToLast} km since last fuel`
            }
          } else {
            segment.fuelWarning = "No fuel data available for this section"
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
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
