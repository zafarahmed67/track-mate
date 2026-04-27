import { NextRequest, NextResponse } from "next/server"
import { findNearby as findNearbyUnverified, upsertMany as upsertUnverified } from "@/lib/unverifiedStopsCache"
import { env } from "@/config/env.config"

const CACHEABLE_TYPES = new Set(["campground", "rv_park"])

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
      // Cache-first for camp/rv types — these are the durable, reusable stops
      // we already track globally. Other types (fuel, restaurants) are too
      // volatile to cache.
      if (CACHEABLE_TYPES.has(type)) {
        const cached = await findNearbyUnverified(Number(lat), Number(lng), {
          bboxDeg: env.UNVERIFIED_CACHE_BBOX_DEG / 4,
          placeTypes: [type],
        })
        if (cached.length >= 5) {
          for (const row of cached.slice(0, 10)) {
            allPlaces.push({
              name: row.location_name,
              lat: row.latitude,
              lng: row.longitude,
              address: row.address ?? "",
              type: row.place_type ?? type,
              rating: row.rating ?? undefined,
              placeId: row.place_id,
            })
          }
          continue
        }
      }

      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&key=${apiKey}`
      const response = await fetch(url)
      const data = await response.json()

      if (data.results) {
        const sliced = data.results.slice(0, 10)
        for (const place of sliced) {
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
        if (CACHEABLE_TYPES.has(type)) {
          await upsertUnverified(sliced, { placeType: type })
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
