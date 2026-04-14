import { NextRequest, NextResponse } from "next/server"
import { env } from "@/config/env.config"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const route = searchParams.get("route")

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

    for (let i = 0; i < samplePoints; i++) {
      const point = coordinates[i * step]
      
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${point.lat},${point.lng}&radius=${env.FUEL_STATIONS_RADIUS}&type=gas_station&key=${apiKey}`

      const response = await fetch(url)
      const data = await response.json()

      if (data.results) {
        for (const station of data.results) {
          const stationLat = station.geometry.location.lat
          const stationLng = station.geometry.location.lng
          
          let minDistance = Infinity
          for (const coord of coordinates) {
            const distance = Math.sqrt(
              Math.pow(coord.lat - stationLat, 2) + Math.pow(coord.lng - stationLng, 2)
            ) * 111
            minDistance = Math.min(minDistance, distance)
          }

          fuelStations.push({
            name: station.name,
            lat: stationLat,
            lng: stationLng,
            address: station.vicinity || "",
            isOpenNow: station.opening_hours?.open_now || false,
            rating: station.rating || 0,
            distanceToRoute: Math.round(minDistance * 10) / 10,
          })
        }
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
