import { NextRequest, NextResponse } from "next/server"
import { env } from "@/config/env.config"
import {
  findNearby as findNearbyUnverified,
  upsertMany as upsertUnverified,
} from "@/lib/unverifiedStopsCache"
import { logPlacesCall } from "@/lib/placesApiLog"

const FUEL_PLACE_TYPE = "gas_station"
const CACHE_SUFFICIENT = 5

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const query = searchParams.get("query")
    const lat = searchParams.get("lat")
    const lng = searchParams.get("lng")
    const tripId = searchParams.get("tripId")

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

    // Cache-first when a location is provided. Text-search results are mostly
    // a free-form way of finding fuel stations near a point — if our cache
    // already has a healthy set there, skip Google entirely.
    if (lat && lng) {
      const cached = await findNearbyUnverified(Number(lat), Number(lng), {
        bboxDeg: env.UNVERIFIED_CACHE_BBOX_DEG,
        placeTypes: [FUEL_PLACE_TYPE],
      })
      if (cached.length >= CACHE_SUFFICIENT) {
        const results = cached.map((row) => ({
          name: row.location_name,
          address: row.address ?? "",
          lat: row.latitude,
          lng: row.longitude,
          isOpenNow: false,
          rating: row.rating ?? 0,
          placeId: row.place_id,
        }))
        logPlacesCall({
          tripId,
          endpoint: "textsearch",
          placeType: FUEL_PLACE_TYPE,
          cacheOutcome: "skipped",
          resultCount: cached.length,
          source: "places/search",
        })
        return NextResponse.json({ success: true, results })
      }
    }

    let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&type=gas_station&key=${apiKey}`

    if (lat && lng) {
      url += `&location=${lat},${lng}&radius=${env.PLACES_SEARCH_RADIUS}`
    }

    const response = await fetch(url)
    const data = await response.json()
    logPlacesCall({
      tripId,
      endpoint: "textsearch",
      placeType: FUEL_PLACE_TYPE,
      cacheOutcome: "miss",
      resultCount: Array.isArray(data?.results) ? data.results.length : 0,
      source: "places/search",
    })

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

    // Cache fuel results for next time. Text search returns formatted_address
    // in `formatted_address` not `vicinity`, so we map it through.
    await upsertUnverified(
      data.results.map((p: {
        name: string
        formatted_address?: string
        geometry: { location: { lat: number; lng: number } }
        rating?: number
        types?: string[]
        place_id?: string
        user_ratings_total?: number
      }) => ({
        place_id: p.place_id,
        name: p.name,
        vicinity: p.formatted_address,
        geometry: p.geometry,
        types: p.types,
        rating: p.rating,
        user_ratings_total: p.user_ratings_total,
      })),
      { placeType: FUEL_PLACE_TYPE, applyOvernightExclusion: false },
    )

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
