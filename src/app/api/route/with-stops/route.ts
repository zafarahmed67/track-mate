import { NextRequest, NextResponse } from "next/server"
import { decodePolyline } from "@/lib/routePolyline"

interface Waypoint {
  lat: number
  lng: number
  name?: string
}

interface GoogleDirectionsRoute {
  summary?: string
  overview_polyline?: { points: string }
  waypoint_order?: number[]
  legs: Array<{
    distance: { value: number }
    duration: { value: number }
    start_address?: string
    end_address?: string
  }>
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

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.NEXT_PUBLIC_GMAPS_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "Google Maps API key not configured" },
        { status: 500 }
      )
    }

    const body = await req.json()
    const { origin, destination, waypoints, optimizeWaypoints = false } = body

    if (!origin?.lat || !origin?.lng || !destination?.lat || !destination?.lng) {
      return NextResponse.json(
        { success: false, error: "Origin and destination coordinates are required" },
        { status: 400 }
      )
    }

    const originLat = Number(origin.lat)
    const originLng = Number(origin.lng)
    const destLat = Number(destination.lat)
    const destLng = Number(destination.lng)

    if (!Number.isFinite(originLat) || !Number.isFinite(originLng) ||
        !Number.isFinite(destLat) || !Number.isFinite(destLng)) {
      return NextResponse.json(
        { success: false, error: "Invalid coordinates" },
        { status: 400 }
      )
    }

    // Build URL with waypoints
    const urlParams = new URLSearchParams({
      origin: `${originLat},${originLng}`,
      destination: `${destLat},${destLng}`,
      mode: "driving",
      key: apiKey,
    })

    // Add waypoints if provided
    const sanitizedWaypoints: Waypoint[] = Array.isArray(waypoints)
      ? waypoints
          .map((w: { lat?: number; lng?: number; name?: string }) => ({
            lat: Number(w.lat),
            lng: Number(w.lng),
            name: w.name,
          }))
          .filter((w) => Number.isFinite(w.lat) && Number.isFinite(w.lng))
      : []

    if (sanitizedWaypoints.length > 0) {
      const waypointStr = sanitizedWaypoints
        .map((w) => `${w.lat},${w.lng}`)
        .join("|")
      
      urlParams.append("waypoints", waypointStr)
      
      if (optimizeWaypoints) {
        urlParams.append("optimize", "true")
      }
    }

    const url = `https://maps.googleapis.com/maps/api/directions/json?${urlParams.toString()}`
    const response = await fetch(url)
    const data = await response.json()

    if (data.status !== "OK" || !data.routes?.length) {
      return NextResponse.json(
        { 
          success: false, 
          error: data.status || "No route found",
          details: data.error_message 
        },
        { status: 400 }
      )
    }

    const selectedRoute = selectBestDirectionsRoute(data.routes as GoogleDirectionsRoute[])
    const route = selectedRoute

    if (!route) {
      return NextResponse.json(
        { success: false, error: "Could not select a valid route" },
        { status: 400 }
      )
    }

    // Extract route information
    const totalDistance = route.legs?.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0) || 0
    const totalDuration = route.legs?.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0) || 0
    
    const polyline = route.overview_polyline?.points 
      ? decodePolyline(route.overview_polyline.points)
      : []

    // Calculate bounds
    let minLat = originLat, maxLat = originLat, minLng = originLng, maxLng = originLng
    polyline.forEach((point) => {
      minLat = Math.min(minLat, point.lat)
      maxLat = Math.max(maxLat, point.lat)
      minLng = Math.min(minLng, point.lng)
      maxLng = Math.max(maxLng, point.lng)
    })

    // Build legs with waypoint info
    const legs = (route.legs || []).map((leg, idx) => ({
      distance: leg.distance?.value ? leg.distance.value / 1000 : 0, // Convert to km
      duration: leg.duration?.value ? leg.duration.value / 60 : 0, // Convert to minutes
      startAddress: leg.start_address || "",
      endAddress: leg.end_address || "",
      // Match with waypoint if available
      waypoint: idx > 0 && idx <= sanitizedWaypoints.length 
        ? sanitizedWaypoints[idx - 1] 
        : null,
    }))

    return NextResponse.json({
      success: true,
      route: {
        distanceKm: totalDistance / 1000,
        durationMinutes: totalDuration / 60,
        polyline,
        bounds: {
          northeast: { lat: maxLat, lng: maxLng },
          southwest: { lat: minLat, lng: minLng },
        },
        legs,
        summary: route.summary || "",
      },
      waypointsUsed: sanitizedWaypoints.length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}