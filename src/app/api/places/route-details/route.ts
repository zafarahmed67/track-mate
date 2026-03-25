import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const origin = searchParams.get("origin")
    const destination = searchParams.get("destination")
    const waypoints = searchParams.get("waypoints")

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

    let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&key=${apiKey}`

    if (waypoints) {
      url += `&waypoints=${encodeURIComponent(waypoints)}`
    }

    const response = await fetch(url)
    const data = await response.json()

    if (data.status !== "OK") {
      return NextResponse.json(
        { success: false, error: data.status },
        { status: 500 }
      )
    }

    const route = data.routes[0]
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
