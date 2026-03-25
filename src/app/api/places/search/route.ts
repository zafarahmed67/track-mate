import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const query = searchParams.get("query")
    const lat = searchParams.get("lat")
    const lng = searchParams.get("lng")

    if (!query) {
      return NextResponse.json(
        { success: false, error: "Search query is required" },
        { status: 400 }
      )
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "Google Maps API key not configured" },
        { status: 500 }
      )
    }

    let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&type=gas_station&key=${apiKey}`
    
    if (lat && lng) {
      url += `&location=${lat},${lng}&radius=50000`
    }

    const response = await fetch(url)
    const data = await response.json()

    if (!data.results) {
      return NextResponse.json({
        success: true,
        results: [],
      })
    }

    const results = data.results.map((place: {
      name: string
      formatted_address?: string
      geometry: { location: { lat: number; lng: number } }
      opening_hours?: { open_now?: boolean }
      rating?: number
      place_id?: string
    }) => ({
      name: place.name,
      address: place.formatted_address || "",
      lat: place.geometry.location.lat,
      lng: place.geometry.location.lng,
      isOpenNow: place.opening_hours?.open_now || false,
      rating: place.rating || 0,
      placeId: place.place_id,
    }))

    return NextResponse.json({
      success: true,
      results,
    })
  } catch (error) {
    console.error("Error searching places:", error)
    return NextResponse.json(
      { success: false, error: "Failed to search places" },
      { status: 500 }
    )
  }
}
