import { supabaseAdmin } from "@/config/supabase"
import { NextRequest, NextResponse } from "next/server"
import { applySuitabilityFilter } from "@/lib/stopSuitabilityFilter"
import type { TripPreferences } from "@/lib/stopSuitabilityFilter"

// Maximum perpendicular distance a stop can be from the actual route polyline (km)
const ROUTE_PROXIMITY_THRESHOLD_KM = 30

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371 // km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const poly: Array<{ lat: number; lng: number }> = []
  let index = 0, lat = 0, lng = 0
  while (index < encoded.length) {
    let b, shift = 0, result = 0
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lat += (result & 1) !== 0 ? ~(result >> 1) : result >> 1
    shift = 0; result = 0
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lng += (result & 1) !== 0 ? ~(result >> 1) : result >> 1
    poly.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }
  return poly
}

function distanceToPolyline(stopLat: number, stopLng: number, polyline: Array<{ lat: number; lng: number }>): { distanceKm: number; cumulativeKm: number } {
  let minDistance = Infinity
  let bestCumulative = 0
  let runningDistance = 0
  for (let i = 0; i < polyline.length; i++) {
    const d = calculateDistance(stopLat, stopLng, polyline[i].lat, polyline[i].lng)
    if (d < minDistance) { minDistance = d; bestCumulative = runningDistance }
    if (i < polyline.length - 1) {
      runningDistance += calculateDistance(polyline[i].lat, polyline[i].lng, polyline[i + 1].lat, polyline[i + 1].lng)
    }
  }
  return { distanceKm: minDistance, cumulativeKm: bestCumulative }
}

async function fetchRoutePolyline(startLat: number, startLng: number, destLat: number, destLng: number): Promise<Array<{ lat: number; lng: number }> | null> {
  const apiKey = process.env.NEXT_PUBLIC_GMAPS_API_KEY
  if (!apiKey) return null
  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${startLat},${startLng}&destination=${destLat},${destLng}&key=${apiKey}`
    const res = await fetch(url)
    const data = await res.json()
    if (data.status !== "OK" || !data.routes[0]) return null
    return decodePolyline(data.routes[0].overview_polyline.points)
  } catch {
    return null
  }
}

function findCorridor(startLat: number, startLng: number, destLat: number, destLng: number): string | null {
  const corridors: Record<string, { lat: number; lng: number }[]> = {
    "Bruce Highway": [
      { lat: -33.77, lng: 150.92 }, // Sydney
      { lat: -27.47, lng: 153.02 }, // Brisbane
      { lat: -21.07, lng: 149.15 }, // Mackay
      { lat: -19.25, lng: 146.8 },  // Townsville
      { lat: -17.5, lng: 146 },      // Innisfail area
      { lat: -12.4, lng: 130.8 },   // Darwin
    ],
    "Pacific Highway": [
      { lat: -33.87, lng: 151.21 }, // Sydney
      { lat: -28.12, lng: 153.45 }, // Gold Coast
      { lat: -29.4, lng: 153.36 },  // Iluka
      { lat: -30.5, lng: 152.97 },   // Urunga
    ],
    "Stuart Highway": [
      { lat: -25.24, lng: 130.99 }, // Yulara/Uluru
      { lat: -31.18, lng: 136.82 }, // Woomera
      { lat: -32.49, lng: 137.78 }, // Port Augusta
      { lat: -23.7, lng: 133.88 },  // Alice Springs
      { lat: -16.25, lng: 133.37 }, // Daly Waters
      { lat: -14.47, lng: 132.27 }, // Katherine
      { lat: -12.33, lng: 130.9 },  // Darwin
    ],
    "Capricorn Highway": [
      { lat: -23.58, lng: 148.61 }, // Bluff
      { lat: -23.53, lng: 148.16 }, // Emerald
      { lat: -23.48, lng: 145.32 }, // Barcaldine/Lara Wetlands
    ],
    "Landsborough Highway": [
      { lat: -23.42, lng: 144.45 }, // Ilfracombe/Wellshot
      { lat: -22.39, lng: 143.04 }, // Winton
    ],
    "Matilda Highway": [
      { lat: -21.26, lng: 141.27 }, // McKinlay
    ],
    "Gulf Savannah Way": [
      { lat: -18.52, lng: 144.08 }, // Einasleigh
      { lat: -18.29, lng: 143.55 }, // Georgetown
      { lat: -18.21, lng: 142.25 }, // Croydon
      { lat: -17.67, lng: 141.08 }, // Normanton
      { lat: -17.49, lng: 140.84 }, // Karumba
    ],
    "Gulf Developmental Road": [
      { lat: -18.15, lng: 144.32 }, // Mount Surprise
      { lat: -18.08, lng: 144.7 },   // Pinnarendi
    ],
    "Kennedy Highway": [
      { lat: -17, lng: 145.42 },    // Mareeba
    ],
    "Peninsula Developmental Road": [
      { lat: -15.77, lng: 144.28 }, // Hann River
      { lat: -13.43, lng: 142.95 }, // Archer River
      { lat: -12.13, lng: 142.65 }, // Bramwell
    ],
  }

  let bestCorridor: string | null = null
  let bestScore = Infinity

  for (const [corridor, points] of Object.entries(corridors)) {
    let score = 0
    for (const point of points) {
      score += calculateDistance(startLat, startLng, point.lat, point.lng)
      score += calculateDistance(destLat, destLng, point.lat, point.lng)
    }
    if (score < bestScore) {
      bestScore = score
      bestCorridor = corridor
    }
  }

  return bestCorridor
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
      tripId,
      startLat,
      startLng,
      destLat,
      destLng,
    } = body

    if (!tripId || !startLat || !startLng || !destLat || !destLng) {
      return NextResponse.json(
        { success: false, error: "tripId and coordinates are required" },
        { status: 400 }
      )
    }

    const corridor = findCorridor(startLat, startLng, destLat, destLng)

    // Fetch trip preferences for suitability filtering (non-fatal if missing)
    let tripPreferences: TripPreferences | null = null
    const { data: tripData, error: tripError } = await supabaseAdmin
      .from("trips")
      .select("rig_type, rig_length_m, pet_friendly_required, avoid_gravel_roads, stay_preference, budget_preference, end_date, trip_duration_days")
      .eq("id", tripId)
      .single()
    if (!tripError && tripData) {
      tripPreferences = tripData as TripPreferences
    }

    console.log("\n" + "=".repeat(60))
    console.log("🔍 FINDING STOPS ALONG ROUTE")
    console.log("=".repeat(60))
    console.log(`📍 Start Coordinates: ${startLat}, ${startLng}`)
    console.log(`📍 Destination Coordinates: ${destLat}, ${destLng}`)
    console.log(`🛣️  Detected Primary Corridor: ${corridor}`)
    console.log("=".repeat(60))

    // Create bounding box to catch stops across multiple corridors
    const bounds = {
      minLat: Math.min(startLat, destLat) - 1,
      maxLat: Math.max(startLat, destLat) + 1,
      minLng: Math.min(startLng, destLng) - 1,
      maxLng: Math.max(startLng, destLng) + 1,
    }

    console.log(`📦 Bounding Box for search:`)
    console.log(`   Min Lat: ${bounds.minLat.toFixed(2)}, Max Lat: ${bounds.maxLat.toFixed(2)}`)
    console.log(`   Min Lng: ${bounds.minLng.toFixed(2)}, Max Lng: ${bounds.maxLng.toFixed(2)}`)

    // Fetch all stops in bounding box (not just corridor)
    const { data: stops, error: stopsError } = await supabaseAdmin
      .from("stops")
      .select("*")
      .gte("latitude", bounds.minLat.toString())
      .lte("latitude", bounds.maxLat.toString())
      .gte("longitude", bounds.minLng.toString())
      .lte("longitude", bounds.maxLng.toString())

    console.log(`✅ Database Query Result: ${stops?.length || 0} stops found in bounding box`)

    if (stopsError) {
      console.error("❌ Error fetching stops:", stopsError)
      return NextResponse.json(
        { success: false, error: stopsError.message },
        { status: 500 }
      )
    }

    if (!stops || stops.length === 0) {
      console.log("⚠️  No stops found in bounding box!")
      console.log(`   You may need to expand search area or check if stops table has data`)
      return NextResponse.json({
        success: true,
        stops: [],
        route: [[startLat, startLng], [destLat, destLng]],
        corridor: corridor,
        bounds: bounds,
        message: "No stops found in search area",
      })
    }

    console.log(`\n📋 Fetched ${stops.length} stops, filtering by route proximity...`)

    // Attempt to get the actual route polyline from Google Directions for precise proximity filtering
    const polyline = await fetchRoutePolyline(startLat, startLng, destLat, destLng)
    const usingPolyline = polyline !== null && polyline.length > 2
    console.log(usingPolyline
      ? `🗺️  Using actual route polyline (${polyline!.length} points) — threshold: ${ROUTE_PROXIMITY_THRESHOLD_KM}km`
      : `⚠️  No polyline available — falling back to straight-line triangle inequality`
    )

    const directDistance = calculateDistance(startLat, startLng, destLat, destLng)

    const stopsWithDistance = stops
      .map((stop) => {
        const lat = parseFloat(stop.latitude)
        const lng = parseFloat(stop.longitude)

        let isBetween: boolean
        let distanceToRoute: number
        let cumulativeKm = 0

        if (usingPolyline) {
          const { distanceKm, cumulativeKm: cum } = distanceToPolyline(lat, lng, polyline!)
          distanceToRoute = distanceKm
          cumulativeKm = cum
          isBetween = distanceKm <= ROUTE_PROXIMITY_THRESHOLD_KM
        } else {
          const distFromStart = calculateDistance(startLat, startLng, lat, lng)
          const distFromDest = calculateDistance(destLat, destLng, lat, lng)
          distanceToRoute = Math.min(distFromStart, distFromDest)
          cumulativeKm = distFromStart
          isBetween = (distFromStart + distFromDest) <= (directDistance + 50)
        }

        return {
          ...stop,
          distance_from_start_km: cumulativeKm,
          distance_to_route_km: distanceToRoute,
          is_between_start_and_dest: isBetween,
        }
      })
      .sort((a, b) => a.distance_from_start_km - b.distance_from_start_km)

    console.log(`\n🔎 ROUTE PROXIMITY RESULTS (${stops.length} stops):`)
    console.log("=".repeat(70))
    stopsWithDistance.forEach((stop, index) => {
      const status = stop.is_between_start_and_dest ? "✅ INCLUDED" : "❌ EXCLUDED"
      console.log(`${index + 1}. ${stop.location_name} - ${status}`)
      console.log(`   Distance to route: ${stop.distance_to_route_km.toFixed(1)}km | Cumulative along route: ${stop.distance_from_start_km.toFixed(1)}km`)
      console.log("-".repeat(70))
    })
    console.log("=".repeat(70))

    const routeFiltered = stopsWithDistance.filter((stop) => stop.is_between_start_and_dest)
    const filtered = tripPreferences
      ? applySuitabilityFilter(routeFiltered, tripPreferences)
      : routeFiltered

    console.log(`\n✅ FINAL RESULT: ${routeFiltered.length} route-filtered → ${filtered.length} after suitability filtering`)
    console.log("=".repeat(70))
    filtered.forEach((stop, index) => {
      console.log(`${index + 1}. ${stop.location_name}`)
      console.log(`   Distance from start: ${stop.distance_from_start_km?.toFixed(1)} km`)
      console.log(`   Stay Type: ${stop.stay_type} | Region: ${stop.region}`)
    })
    console.log("=".repeat(70) + "\n")

    if (filtered.length > 0) {
      const stopsToInsert = filtered.slice(0, 30).map((stop, index) => ({
        trip_id: tripId,
        stop_id: stop.id,
        selected_by_ai: true,
        generation_version: 1,
        rank_score: 1 - (index / 30),
        distance_to_route_km: stop.distance_to_route_km,
      }))

      console.log("Inserting stops:", JSON.stringify(stopsToInsert.slice(0, 2), null, 2))

      const { error: insertError } = await supabaseAdmin
        .from("trip_candidate_stops")
        .insert(stopsToInsert)

      if (insertError) {
        console.error("❌ Error inserting candidate stops:", insertError)
        console.log("Trying upsert as fallback...")
        
        const { error: upsertError } = await supabaseAdmin
          .from("trip_candidate_stops")
          .upsert(stopsToInsert)
        
        if (upsertError) {
          console.error("❌ Upsert also failed:", upsertError)
        } else {
          console.log(`✅ Upsert succeeded: ${stopsToInsert.length} candidate stops`)
        }
      } else {
        console.log(`✅ Insert succeeded: ${stopsToInsert.length} candidate stops`)
      }
    } else {
      console.log("⚠️ No filtered stops to insert")
    }

    return NextResponse.json({
      success: true,
      stops: filtered,
      route: [[startLat, startLng], [destLat, destLng]],
      corridor: corridor,
      bounds: bounds,
      stats: {
        total_fetched: stops.length,
        total_route_filtered: routeFiltered.length,
        total_suitability_filtered: filtered.length,
        direct_distance_km: directDistance.toFixed(1),
        polyline_used: usingPolyline,
      }
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
