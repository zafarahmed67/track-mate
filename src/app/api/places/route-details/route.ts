import { NextRequest, NextResponse } from "next/server"

interface GoogleDirectionsRoute {
  summary?: string
  legs: Array<{
    distance: { value: number; text: string }
    duration: { value: number; text: string }
    start_location: { lat: number; lng: number }
    end_location: { lat: number; lng: number }
  }>
  overview_polyline: { points: string }
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const origin = searchParams.get("origin")
    const destination = searchParams.get("destination")
    const waypoints = searchParams.get("waypoints")
    const rigType = searchParams.get("rigType")
    const avoidGravelRoads = searchParams.get("avoidGravelRoads") === "true"

    if (!origin || !destination) {
      return NextResponse.json(
        { success: false, error: "origin and destination are required" },
        { status: 400 }
      )
    }

    const apiKey = process.env.NEXT_PUBLIC_GMAPS_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "Google Maps API key not configured" },
        { status: 500 }
      )
    }

    const urlParams = new URLSearchParams({
      origin,
      destination,
      mode: "driving",
      key: apiKey,
    })

    const normalizedRig = (rigType || "").toLowerCase()
    if (["caravan", "motorhome", "campervan"].includes(normalizedRig)) {
      urlParams.append("avoid", "ferries")
    }

    if (avoidGravelRoads && !waypoints) {
      urlParams.append("alternatives", "true")
    }

    if (waypoints) {
      urlParams.append("waypoints", waypoints)
    }

    const url = `https://maps.googleapis.com/maps/api/directions/json?${urlParams.toString()}`

    const response = await fetch(url)
    const data = await response.json()

    if (data.status !== "OK") {
      return NextResponse.json(
        { success: false, error: data.status },
        { status: 500 }
      )
    }

    const route = selectBestDirectionsRoute(data.routes as GoogleDirectionsRoute[])
    const leg = route.legs[0]

    return NextResponse.json({
      success: true,
      route: {
        distance: leg.distance.value,
        distanceText: leg.distance.text,
        duration: leg.duration.value,
        durationText: leg.duration.text,
        startLocation: {
          lat: leg.start_location.lat,
          lng: leg.start_location.lng,
        },
        endLocation: {
          lat: leg.end_location.lat,
          lng: leg.end_location.lng,
        },
        steps: route.overview_polyline.points,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
