import { NextRequest, NextResponse } from "next/server"
import { env } from "@/config/env.config"

interface GoogleDirectionsRoute {
  summary?: string
  overview_polyline: { points: string }
  legs: Array<{
    distance?: { text: string }
    duration?: { text: string }
    steps: Array<{
      end_location: { lat: number; lng: number }
    }>
  }>
}

function selectBestDirectionsRoute(routes: GoogleDirectionsRoute[], threshold = 1.1) {
  if (routes.length <= 1) {
    return routes[0]
  }

  const sortedByDistance = routes
    .filter((route) => route.legs?.[0]?.distance?.text)
    .slice()
    .sort((a, b) => {
      const aKm = Number(String(a.legs[0].distance?.text || "0").replace(/[^0-9.]/g, ""))
      const bKm = Number(String(b.legs[0].distance?.text || "0").replace(/[^0-9.]/g, ""))
      return aKm - bKm
    })

  if (sortedByDistance.length === 0) {
    return routes[0]
  }

  const shortestKm = Number(String(sortedByDistance[0].legs[0].distance?.text || "0").replace(/[^0-9.]/g, "")) || 1
  const highwayPreferred = sortedByDistance.find((route) => {
    const summary = (route.summary || "").toLowerCase()
    const isHighway = summary.includes("highway") || summary.includes("hwy") || summary.includes("freeway") || summary.includes("motorway")
    if (!isHighway) return false
    const distanceKm = Number(String(route.legs[0].distance?.text || "0").replace(/[^0-9.]/g, ""))
    return (distanceKm / shortestKm) <= threshold
  })

  return highwayPreferred || sortedByDistance[0]
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const origin = searchParams.get("origin")
    const destination = searchParams.get("destination")
    const rigType = searchParams.get("rigType")
    const avoidGravelRoads = searchParams.get("avoidGravelRoads") === "true"

    if (!origin || !destination) {
      return NextResponse.json(
        { success: false, error: "Origin and destination are required" },
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

    if (avoidGravelRoads) {
      urlParams.append("alternatives", "true")
    }

    const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?${urlParams.toString()}`
    
    const directionsResponse = await fetch(directionsUrl)
    const directionsData = await directionsResponse.json()

    if (!directionsData.routes || directionsData.routes.length === 0) {
      return NextResponse.json(
        { success: false, error: "Could not get route" },
        { status: 400 }
      )
    }

    const selectedRoute = selectBestDirectionsRoute(directionsData.routes as GoogleDirectionsRoute[])
    const steps = selectedRoute.legs[0].steps
    
    const coordinates: Array<{lat: number, lng: number}> = []
    for (const step of steps) {
      const endLocation = step.end_location
      coordinates.push({ lat: endLocation.lat, lng: endLocation.lng })
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

    const samplePoints = Math.min(coordinates.length, 15)
    const step = Math.max(1, Math.floor(coordinates.length / samplePoints))

    for (let i = 0; i < coordinates.length; i += step) {
      const point = coordinates[i]
      
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${point.lat},${point.lng}&radius=${env.FUEL_ALONG_ROUTE_RADIUS}&type=gas_station&key=${apiKey}`

      try {
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

            if (minDistance <= 10) {
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
      } catch (e) {
        console.error("Error fetching stations at point:", e)
      }
    }

    const uniqueStations = fuelStations.reduce((acc: typeof fuelStations, station) => {
      const exists = acc.some(
        (s) =>
          Math.abs(s.lat - station.lat) < 0.005 &&
          Math.abs(s.lng - station.lng) < 0.005
      )
      if (!exists) {
        acc.push(station)
      }
      return acc
    }, [])

    uniqueStations.sort((a, b) => {
      if (a.distanceToRoute !== b.distanceToRoute) {
        return a.distanceToRoute - b.distanceToRoute
      }
      return b.rating - a.rating
    })

    return NextResponse.json({
      success: true,
      fuelStations: uniqueStations.slice(0, 15),
      routeDistance: selectedRoute.legs[0].distance?.text,
      routeDuration: selectedRoute.legs[0].duration?.text,
    })
  } catch (error) {
    console.error("Error fetching fuel stations along route:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch fuel stations" },
      { status: 500 }
    )
  }
}
