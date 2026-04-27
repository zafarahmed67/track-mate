import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/config/supabase"
import {
  decodePolyline,
  buildCumulativeDistanceTable,
  samplePolylineAtKm,
  projectPointOntoPolyline,
} from "@/lib/routePolyline"
import type { FuelStation } from "@/types/trip"

const TRAVEL_PACE_KM: Record<string, number> = {
  leisurely: 175,
  moderate: 250,
  fast: 350,
}

// Safe fuel range varies by latitude: remote/northern routes need more caution.
function safeRangeKm(avgLat: number): number {
  const northWeight = Math.max(0, Math.min(1, (avgLat - -38) / 20))
  return Math.round(Math.max(150, Math.min(230, 230 - northWeight * 80)))
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params

  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, error: "DB not configured" }, { status: 500 })
  }

  const apiKey = process.env.NEXT_PUBLIC_GMAPS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ success: false, error: "Maps API key not configured" }, { status: 500 })
  }

  // ── 1. Fetch trip ─────────────────────────────────────────────────────────
  const { data: trip, error: tripErr } = await supabaseAdmin
    .from("trips")
    .select("start_lat, start_lng, destination_lat, destination_lng, trip_duration_days, total_distance_km, travel_pace")
    .eq("id", tripId)
    .single()

  if (tripErr || !trip) {
    return NextResponse.json({ success: false, error: "Trip not found" }, { status: 404 })
  }

  const { start_lat, start_lng, destination_lat, destination_lng, travel_pace, total_distance_km } = trip
  const kmPerDay = TRAVEL_PACE_KM[travel_pace ?? "moderate"] ?? 250
  const tripDays = Math.max(1, Math.round((total_distance_km ?? 0) / kmPerDay))
  const totalKm = total_distance_km ?? 0

  // ── 2. Fetch route polyline ───────────────────────────────────────────────
  let polyline: ReturnType<typeof decodePolyline> = []
  let cumTable: number[] = []

  try {
    const dirRes = await fetch(
      `https://maps.googleapis.com/maps/api/directions/json?` +
      new URLSearchParams({
        origin: `${start_lat},${start_lng}`,
        destination: `${destination_lat},${destination_lng}`,
        mode: "driving",
        key: apiKey,
      })
    )
    const dirData = await dirRes.json()
    const encoded = dirData.routes?.[0]?.overview_polyline?.points
    if (encoded) {
      polyline = decodePolyline(encoded)
      cumTable = buildCumulativeDistanceTable(polyline)
    }
  } catch {
    // fall through — we'll use start/dest straight line if polyline fails
  }

  const hasPolyline = polyline.length >= 2
  const routeTotalKm = hasPolyline ? cumTable[cumTable.length - 1] : totalKm

  // ── 3. Sample probe points along route ───────────────────────────────────
  const probeSpacingKm = Math.max(30, routeTotalKm / 20)
  const probeCount = Math.ceil(routeTotalKm / probeSpacingKm) + 1
  const probePoints: Array<{ lat: number; lng: number }> = []

  for (let i = 0; i <= probeCount; i++) {
    const targetKm = Math.min(i * probeSpacingKm, routeTotalKm)
    if (hasPolyline) {
      probePoints.push(samplePolylineAtKm(targetKm, polyline, cumTable))
    } else {
      const frac = routeTotalKm > 0 ? targetKm / routeTotalKm : 0
      probePoints.push({
        lat: start_lat + (destination_lat - start_lat) * frac,
        lng: start_lng + (destination_lng - start_lng) * frac,
      })
    }
  }

  // ── 4. Search Google Places for fuel stations at each probe ───────────────
  const isRemote = (destination_lat ?? 0) > (start_lat ?? 0) && totalKm > 500
  const maxLateralKm = isRemote ? 50 : 30
  const searchRadiusM = maxLateralKm * 1000

  const rawStations: Array<FuelStation & { distanceFromStartKm: number }> = []
  const seenKeys = new Set<string>()

  for (const point of probePoints) {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?` +
        new URLSearchParams({
          location: `${point.lat},${point.lng}`,
          radius: String(searchRadiusM),
          type: "gas_station",
          key: apiKey,
        })
      )
      const data = await res.json()
      for (const place of (data.results ?? []).slice(0, 20)) {
        const lat = Number(place.geometry?.location?.lat ?? 0)
        const lng = Number(place.geometry?.location?.lng ?? 0)
        if (!lat || !lng) continue

        // Deduplicate by grid cell (≈500 m)
        const cell = `${(lat * 200).toFixed(0)}|${(lng * 200).toFixed(0)}`
        if (seenKeys.has(cell)) continue

        // Project onto route
        let distanceFromStartKm = 0
        let lateralKm = 0
        if (hasPolyline) {
          const proj = projectPointOntoPolyline(lat, lng, polyline, cumTable)
          distanceFromStartKm = proj.distanceFromStartKm
          lateralKm = proj.lateralKm
        } else {
          // straight-line approximation
          const avgLatRad = ((start_lat + destination_lat) / 2) * Math.PI / 180
          const scaleX = Math.cos(avgLatRad)
          const vx = (destination_lng - start_lng) * scaleX
          const vy = destination_lat - start_lat
          const wx = (lng - start_lng) * scaleX
          const wy = lat - start_lat
          const vLenSq = vx * vx + vy * vy
          const t = vLenSq > 1e-12 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / vLenSq)) : 0
          const projLat = start_lat + t * (destination_lat - start_lat)
          const projLng = start_lng + t * (destination_lng - start_lng)
          const R = 6371
          const dLat = (lat - projLat) * Math.PI / 180
          const dLng = (lng - projLng) * Math.PI / 180
          lateralKm = R * 2 * Math.atan2(
            Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(projLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2),
            Math.sqrt(1 - Math.sin(dLat / 2) ** 2 - Math.cos(projLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2)
          )
          distanceFromStartKm = t * routeTotalKm
        }

        if (lateralKm > maxLateralKm) continue

        seenKeys.add(cell)
        rawStations.push({
          id: place.place_id ?? cell,
          name: place.name ?? "Fuel Station",
          lat,
          lng,
          address: place.vicinity ?? "",
          isOpenNow: place.opening_hours?.open_now ?? false,
          rating: place.rating ?? 0,
          distanceFromStartKm: Math.round(distanceFromStartKm * 10) / 10,
        })
      }
    } catch {
      // skip failed probe
    }
  }

  // Sort all stations by route position
  rawStations.sort((a, b) => a.distanceFromStartKm - b.distanceFromStartKm)

  // Average latitude for safe-range calculation
  const avgLat = ((start_lat ?? 0) + (destination_lat ?? 0)) / 2
  const safeKm = safeRangeKm(avgLat)

  // ── 5. Build per-day fuel data ────────────────────────────────────────────
  type DayFuel = {
    suggestions: FuelStation[]
    primarySuggestion: FuelStation | null
    fuelCritical: boolean
    fuelWarning: string | null
    gapFromLastFuelKm: number
    gapToNextFuelKm: number
    fuelDistanceIntoLegKm: number | undefined
    isRemote: boolean
  }

  const fuelByDay: Record<string, DayFuel> = {}

  for (let day = 0; day < tripDays; day++) {
    const startKm = day * kmPerDay
    const endKm = Math.min((day + 1) * kmPerDay, routeTotalKm)
    const midKm = (startKm + endKm) / 2

    const dayStations = rawStations
      .filter(s => s.distanceFromStartKm >= startKm - 30 && s.distanceFromStartKm <= endKm + 30)
      .sort((a, b) => Math.abs(a.distanceFromStartKm - midKm) - Math.abs(b.distanceFromStartKm - midKm))
      .slice(0, 3)

    const lastBeforeStart = [...rawStations].reverse().find(s => s.distanceFromStartKm < startKm)
    const gapFromLastFuelKm = lastBeforeStart
      ? Math.round(startKm - lastBeforeStart.distanceFromStartKm)
      : day === 0 ? 0 : Math.round(startKm)

    const firstAfterEnd = rawStations.find(s => s.distanceFromStartKm > endKm)
    const gapToNextFuelKm = firstAfterEnd
      ? Math.round(firstAfterEnd.distanceFromStartKm - endKm)
      : Math.round(routeTotalKm - endKm)

    const fuelCritical = gapFromLastFuelKm > safeKm || gapToNextFuelKm > safeKm

    let fuelWarning: string | null = null
    if (fuelCritical) {
      const parts: string[] = []
      if (gapFromLastFuelKm > safeKm) parts.push(`${gapFromLastFuelKm} km since last fuel`)
      if (gapToNextFuelKm > safeKm) parts.push(`next fuel ${gapToNextFuelKm} km ahead`)
      fuelWarning = `Long fuel gap: ${parts.join(", ")}. Top up at every opportunity.`
    }

    const primaryStation = dayStations[0] ?? null
    const fuelDistanceIntoLegKm = primaryStation
      ? Math.max(0, Math.round(primaryStation.distanceFromStartKm - startKm))
      : undefined

    fuelByDay[String(day + 1)] = {
      suggestions: dayStations,
      primarySuggestion: primaryStation,
      fuelCritical,
      fuelWarning,
      gapFromLastFuelKm,
      gapToNextFuelKm,
      fuelDistanceIntoLegKm,
      isRemote,
    }
  }

  // ── 6. Persist fuelByDay onto trips.route_data_json (single source of truth
  //       for trip-level compute outputs). ──
  const { data: tripRow } = await supabaseAdmin
    .from("trips")
    .select("route_data_json")
    .eq("id", tripId)
    .maybeSingle()

  const existingRouteData = (tripRow?.route_data_json as Record<string, unknown> | null) ?? {}
  await supabaseAdmin
    .from("trips")
    .update({ route_data_json: { ...existingRouteData, fuelByDay } })
    .eq("id", tripId)

  return NextResponse.json({ success: true, fuelByDay })
}
