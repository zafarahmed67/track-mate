import { supabaseAdmin } from "@/config/supabase"
import { NextRequest, NextResponse } from "next/server"

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

    console.log(`\n📋 Fetched ${stops.length} stops, filtering by distance and route proximity...`)

    // Calculate distance from start and filter stops between start and destination
    const directDistance = calculateDistance(startLat, startLng, destLat, destLng)
    console.log(`\n📏 Direct distance from start to destination: ${directDistance.toFixed(1)} km`)
    console.log(`   Using 50km buffer as threshold for "between" detection\n`)

    const stopsWithDistance = stops
      .map((stop) => {
        const lat = parseFloat(stop.latitude)
        const lng = parseFloat(stop.longitude)
        const distFromStart = calculateDistance(startLat, startLng, lat, lng)
        const distFromDest = calculateDistance(destLat, destLng, lat, lng)
        const sumDist = distFromStart + distFromDest
        const isBetween = sumDist <= (directDistance + 50)
        
        return {
          ...stop,
          distance_from_start_km: distFromStart,
          distance_from_dest_km: distFromDest,
          is_between_start_and_dest: isBetween,
          sum_distance: sumDist,
        }
      })
      .sort((a, b) => a.distance_from_start_km - b.distance_from_start_km)

    console.log(`\n🔎 ANALYZING ALL ${stops.length} STOPS:`)
    console.log("=".repeat(70))
    stops.forEach((stop, index) => {
      const lat = parseFloat(stop.latitude)
      const lng = parseFloat(stop.longitude)
      const distFromStart = calculateDistance(startLat, startLng, lat, lng)
      const distFromDest = calculateDistance(destLat, destLng, lat, lng)
      const sumDist = distFromStart + distFromDest
      const isBetween = sumDist <= (directDistance + 50)
      
      const status = isBetween ? "✅ INCLUDED" : "❌ EXCLUDED"
      console.log(`${index + 1}. ${stop.location_name} - ${status}`)
      console.log(`   Corridor: ${stop.corridor}`)
      console.log(`   Coords: ${lat}, ${lng}`)
      console.log(`   From Start: ${distFromStart.toFixed(1)}km | From Dest: ${distFromDest.toFixed(1)}km | Sum: ${sumDist.toFixed(1)}km`)
      console.log(`   Threshold: ${(directDistance + 50).toFixed(1)}km`)
      console.log("-".repeat(70))
    })
    console.log("=".repeat(70))

    const filtered = stopsWithDistance.filter((stop) => stop.is_between_start_and_dest)
    console.log(`\n✅ FINAL RESULT: ${filtered.length} stops included after filtering`)
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
        distance_to_route_km: stop.distance_from_start_km,
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
        total_filtered: filtered.length,
        direct_distance_km: directDistance.toFixed(1),
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
