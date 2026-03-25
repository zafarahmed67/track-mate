import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const lat = searchParams.get("lat")
    const lng = searchParams.get("lng")
    const types = searchParams.get("types") || "gas_station,restaurant,cafe,car_wash,car_repair,pharmacy,supermarket,campground,rv_park"
    const radius = searchParams.get("radius") || "10000"

    if (!lat || !lng) {
      return NextResponse.json(
        { success: false, error: "lat and lng are required" },
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

    const typesArray = types.split(",")
    const allPlaces: Array<{
      name: string
      lat: number
      lng: number
      address: string
      type: string
      rating?: number
      isOpenNow?: boolean
      placeId?: string
    }> = []

    for (const type of typesArray) {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&key=${apiKey}`

      const response = await fetch(url)
      const data = await response.json()

      if (data.results) {
        for (const place of data.results.slice(0, 10)) {
          allPlaces.push({
            name: place.name,
            lat: place.geometry.location.lat,
            lng: place.geometry.location.lng,
            address: place.vicinity || "",
            type: place.types[0],
            rating: place.rating,
            isOpenNow: place.opening_hours?.open_now,
            placeId: place.place_id,
          })
        }
      }
    }

    allPlaces.sort((a, b) => (b.rating || 0) - (a.rating || 0))

    return NextResponse.json({
      success: true,
      places: allPlaces.slice(0, 20),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
