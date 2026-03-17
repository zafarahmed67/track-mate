import { supabaseAdmin } from "@/config/supabase"
import { NextRequest, NextResponse } from "next/server"

function decodePolyline(encoded: string): [number, number][] {
  const poly: [number, number][] = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    let b: number
    let shift = 0
    let result = 0

    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)

    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1
    lat += dlat

    shift = 0
    result = 0

    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)

    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1
    lng += dlng

    poly.push([lat / 1e5, lng / 1e5])
  }

  return poly
}

function calculateDistanceToLine(
  pointLat: number,
  pointLng: number,
  lineCoords: [number, number][]
): number {
  let minDistance = Infinity

  for (let i = 0; i < lineCoords.length - 1; i++) {
    const [lat1, lng1] = lineCoords[i]
    const [lat2, lng2] = lineCoords[i + 1]

    const distance = pointToLineDistance(pointLat, pointLng, lat1, lng1, lat2, lng2)
    minDistance = Math.min(minDistance, distance)
  }

  return minDistance
}

function pointToLineDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const A = px - x1
  const B = py - y1
  const C = x2 - x1
  const D = y2 - y1

  const dot = A * C + B * D
  const lenSq = C * C + D * D
  let param = -1

  if (lenSq !== 0) param = dot / lenSq

  let xx: number
  let yy: number

  if (param < 0) {
    xx = x1
    yy = y1
  } else if (param > 1) {
    xx = x2
    yy = y2
  } else {
    xx = x1 + param * C
    yy = y1 + param * D
  }

  const dx = px - xx
  const dy = py - yy
  return Math.sqrt(dx * dx + dy * dy) * 111.32
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
      startLocationText,
      destLocationText,
      maxDistanceMeters = 1000 
    } = body

    if (!tripId || !startLat || !startLng || !destLat || !destLng) {
      return NextResponse.json(
        { success: false, error: "tripId and coordinates are required" },
        { status: 400 }
      )
    }

    const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${startLat},${startLng}&destination=${destLat},${destLng}&key=${process.env.NEXT_PUBLIC_GMAPS_API_KEY}`
    
    const directionsResponse = await fetch(directionsUrl)
    const directionsData = await directionsResponse.json()

    console.log("Directions API response:", directionsData)

    let routePolyline: [number, number][] = []
    let routeDataJson = {}

    if (directionsData.status === "OK" && directionsData.routes.length > 0) {
      const route = directionsData.routes[0]
      const encodedPolyline = route.overview_polyline.points
      console.log("Encoded polyline:", encodedPolyline)
      routePolyline = decodePolyline(encodedPolyline)
      console.log("Decoded polyline:", routePolyline)
      
      routeDataJson = {
        overview_polyline: encodedPolyline,
        bounds: route.bounds,
        legs: route.legs.map((leg: { distance: { text: string; value: number }; duration: { text: string; value: number }; start_address: string; end_address: string }) => ({
          distance: leg.distance.text,
          duration: leg.duration.text,
          start_address: leg.start_address,
          end_address: leg.end_address,
        })),
        encoded_polyline: encodedPolyline,
      }
    }

    await supabaseAdmin
      .from("trips")
      .update({ route_data_json: routeDataJson })
      .eq("id", tripId)

    if (routePolyline.length === 0) {
      return NextResponse.json({
        success: true,
        stops: [],
        message: "Could not generate route",
      })
    }

    const bounds = {
      minLat: Math.min(startLat, destLat) - 0.5,
      maxLat: Math.max(startLat, destLat) + 0.5,
      minLng: Math.min(startLng, destLng) - 0.5,
      maxLng: Math.max(startLng, destLng) + 0.5,
    }

    console.log("Searching stops in bounds:", bounds)

    const { data: stops, error: stopsError } = await supabaseAdmin
      .from("stops")
      .select("*")
      .gte("latitude", bounds.minLat.toString())
      .lte("latitude", bounds.maxLat.toString())
      .gte("longitude", bounds.minLng.toString())
      .lte("longitude", bounds.maxLng.toString())
      .limit(50)

    console.log("Found stops in bounds:", stops?.length || 0)

    if (stopsError) {
      console.error("Error fetching stops:", stopsError)
      return NextResponse.json(
        { success: false, error: stopsError.message },
        { status: 500 }
      )
    }

    if (!stops || stops.length === 0) {
      return NextResponse.json({
        success: true,
        stops: [],
        route: routePolyline,
      })
    }

    const maxDistanceDeg = maxDistanceMeters / 111320
    console.log("Max distance in degrees:", maxDistanceDeg)

    const stopsWithDistance = stops
      .map((stop) => {
        const lat = parseFloat(stop.latitude)
        const lng = parseFloat(stop.longitude)
        const distanceToRoute = calculateDistanceToLine(lat, lng, routePolyline)
        return {
          ...stop,
          distance_to_route_km: distanceToRoute,
        }
      })
      .filter((stop) => stop.distance_to_route_km <= maxDistanceDeg)
      .sort((a, b) => a.distance_to_route_km - b.distance_to_route_km)

    if (stopsWithDistance.length > 0) {
      const stopsToInsert = stopsWithDistance.slice(0, 30).map((stop, index) => ({
        trip_id: tripId,
        stop_id: stop.id,
        selected_by_ai: true,
        generation_version: 1,
        rank_score: 1 - (index / 30),
        distance_to_route_km: stop.distance_to_route_km,
      }))

      await supabaseAdmin
        .from("trip_candidate_stops")
        .upsert(stopsToInsert, {
          onConflict: "trip_id,stop_id",
        })
    }

    return NextResponse.json({
      success: true,
      stops: stopsWithDistance,
      route: routePolyline,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
