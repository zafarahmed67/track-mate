import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const origin = searchParams.get("origin")
    const destination = searchParams.get("destination")

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

    const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=driving&key=${apiKey}`
    
    const directionsResponse = await fetch(directionsUrl)
    const directionsData = await directionsResponse.json()

    if (!directionsData.routes || directionsData.routes.length === 0) {
      return NextResponse.json(
        { success: false, error: "Could not get route" },
        { status: 400 }
      )
    }

    const encodedPolyline = directionsData.routes[0].overview_polyline.points
    const steps = directionsData.routes[0].legs[0].steps
    
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
      
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${point.lat},${point.lng}&radius=8000&type=gas_station&key=${apiKey}`

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
      routeDistance: directionsData.routes[0].legs[0].distance?.text,
      routeDuration: directionsData.routes[0].legs[0].duration?.text,
    })
  } catch (error) {
    console.error("Error fetching fuel stations along route:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch fuel stations" },
      { status: 500 }
    )
  }
}
