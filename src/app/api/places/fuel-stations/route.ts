import { NextRequest, NextResponse } from "next/server"
import { env } from "@/config/env.config"
import {
  findNearby as findNearbyUnverified,
  upsertMany as upsertUnverified,
} from "@/lib/unverifiedStopsCache"
import { logPlacesCall } from "@/lib/placesApiLog"

const FUEL_PLACE_TYPE = "gas_station"
const CACHE_SUFFICIENT_PER_POINT = 3

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const route = searchParams.get("route")
    const tripId = searchParams.get("tripId")

    if (!route) {
      return NextResponse.json(
        { success: false, error: "Route coordinates are required" },
        { status: 400 }
      )
    }

    const coordinates = route.split(";").map((coord) => {
      const [lat, lng] = coord.split(",").map(Number)
      return { lat, lng }
    })

    if (coordinates.length < 2) {
      return NextResponse.json(
        { success: false, error: "Invalid route coordinates" },
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

    const fuelStations: Array<{
      name: string
      lat: number
      lng: number
      address: string
      isOpenNow: boolean
      rating: number
      distanceToRoute: number
    }> = []

    const samplePoints = Math.min(coordinates.length, 10)
    const step = Math.floor(coordinates.length / samplePoints)

    const distanceToRouteKm = (lat: number, lng: number): number => {
      let minDistance = Infinity
      for (const coord of coordinates) {
        const distance =
          Math.sqrt(Math.pow(coord.lat - lat, 2) + Math.pow(coord.lng - lng, 2)) *
          111
        minDistance = Math.min(minDistance, distance)
      }
      return Math.round(minDistance * 10) / 10
    }

    for (let i = 0; i < samplePoints; i++) {
      const point = coordinates[i * step]

      // Cache-first: skip Google entirely when our unverified_stops table
      // already has enough fuel stops near this probe point.
      const cached = await findNearbyUnverified(point.lat, point.lng, {
        bboxDeg: env.UNVERIFIED_CACHE_BBOX_DEG / 4,
        placeTypes: [FUEL_PLACE_TYPE],
      })
      if (cached.length >= CACHE_SUFFICIENT_PER_POINT) {
        for (const row of cached) {
          fuelStations.push({
            name: row.location_name,
            lat: row.latitude,
            lng: row.longitude,
            address: row.address ?? "",
            isOpenNow: false,
            rating: row.rating ?? 0,
            distanceToRoute: distanceToRouteKm(row.latitude, row.longitude),
          })
        }
        logPlacesCall({
          tripId,
          endpoint: "nearbysearch",
          placeType: FUEL_PLACE_TYPE,
          cacheOutcome: "skipped",
          resultCount: cached.length,
          source: "places/fuel-stations",
        })
        continue
      }

      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${point.lat},${point.lng}&radius=${env.FUEL_STATIONS_RADIUS}&type=${FUEL_PLACE_TYPE}&key=${apiKey}`

      const response = await fetch(url)
      const data = await response.json()
      logPlacesCall({
        tripId,
        endpoint: "nearbysearch",
        placeType: FUEL_PLACE_TYPE,
        cacheOutcome: "miss",
        resultCount: Array.isArray(data?.results) ? data.results.length : 0,
        source: "places/fuel-stations",
      })

      if (data.results) {
        for (const station of data.results) {
          const stationLat = station.geometry.location.lat
          const stationLng = station.geometry.location.lng
          fuelStations.push({
            name: station.name,
            lat: stationLat,
            lng: stationLng,
            address: station.vicinity || "",
            isOpenNow: station.opening_hours?.open_now || false,
            rating: station.rating || 0,
            distanceToRoute: distanceToRouteKm(stationLat, stationLng),
          })
        }
        await upsertUnverified(data.results, {
          placeType: FUEL_PLACE_TYPE,
          applyOvernightExclusion: false,
        })
      }
    }

    const uniqueStations = fuelStations.reduce((acc: typeof fuelStations, station) => {
      const exists = acc.some(
        (s) =>
          Math.abs(s.lat - station.lat) < 0.001 &&
          Math.abs(s.lng - station.lng) < 0.001
      )
      if (!exists) {
        acc.push(station)
      }
      return acc
    }, [])

    uniqueStations.sort((a, b) => a.distanceToRoute - b.distanceToRoute)

    return NextResponse.json({
      success: true,
      fuelStations: uniqueStations.slice(0, 20),
    })
  } catch (error) {
    console.error("Error fetching fuel stations:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch fuel stations" },
      { status: 500 }
    )
  }
}
