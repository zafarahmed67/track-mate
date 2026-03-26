import { supabaseAdmin } from "@/config/supabase"
import { NextRequest, NextResponse } from "next/server"
import { applySuitabilityFilter } from "@/lib/stopSuitabilityFilter"
import type { TripPreferences } from "@/lib/stopSuitabilityFilter"

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

export async function POST(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
      )
    }

    const body = await req.json()
    const { startLat, startLng, destLat, destLng, travelPace = "moderate", tripId } = body

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

    const bounds = {
      minLat: Math.min(startLat, destLat) - 2,
      maxLat: Math.max(startLat, destLat) + 2,
      minLng: Math.min(startLng, destLng) - 2,
      maxLng: Math.max(startLng, destLng) + 2,
    }

    // Fetch trip preferences for suitability filtering (non-fatal if missing)
    let tripPreferences: TripPreferences | null = null
    if (tripId) {
      const { data: tripData, error: tripError } = await supabaseAdmin
        .from("trips")
        .select("rig_type, rig_length_m, pet_friendly_required, avoid_gravel_roads, stay_preference, budget_preference, end_date, trip_duration_days")
        .eq("id", tripId)
        .single()
      if (!tripError && tripData) {
        tripPreferences = tripData as TripPreferences
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

    const directDistance = calculateDistance(startLat, startLng, destLat, destLng)

    let fuelStations: Array<{
      name: string
      lat: number
      lng: number
      address: string
    }> = []

    if (apiKey && drivingInfo) {
      try {
        const fuelUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${(startLat + destLat) / 2},${(startLng + destLng) / 2}&radius=50000&type=gas_station&key=${apiKey}`
        const fuelResponse = await fetch(fuelUrl)
        const fuelData = await fuelResponse.json()

        if (fuelData.results) {
          fuelStations = fuelData.results.map((station: { name: string; geometry: { location: { lat: number; lng: number } }; vicinity: string }) => ({
            name: station.name,
            lat: station.geometry.location.lat,
            lng: station.geometry.location.lng,
            address: station.vicinity || "",
          }))
        }
      } catch (err) {
        console.error("Error fetching fuel stations:", err)
      }
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

    const stopsWithDistance = tripPreferences
      ? applySuitabilityFilter(routeFiltered ?? [], tripPreferences)
      : (routeFiltered ?? [])

    const segments: Array<{
      startKm: number
      endKm: number
      verifiedStops: typeof stopsWithDistance
      otherStops: typeof stopsWithDistance
    }> = []

    if (drivingInfo) {
      const numSegments = Math.max(1, Math.floor(drivingInfo.totalDistanceKm / config.kmPerDay))
      const segmentLength = drivingInfo.totalDistanceKm / numSegments

      for (let i = 0; i < numSegments; i++) {
        const startKm = i * segmentLength
        const endKm = (i + 1) * segmentLength

        const verifiedInSegment = stopsWithDistance?.filter(s => 
          s.is_verified && s.distance_from_start_km >= startKm && s.distance_from_start_km < endKm
        ) || []

        const otherInSegment = stopsWithDistance?.filter(s => 
          !s.is_verified && s.distance_from_start_km >= startKm && s.distance_from_start_km < endKm
        ) || []

        segments.push({
          startKm,
          endKm,
          verifiedStops: verifiedInSegment,
          otherStops: otherInSegment,
        })
      }
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
      fuelStations: fuelStations.slice(0, 15),
      corridor,
      segments,
      drivingInfo,
      paceConfig: config,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
