import { NextRequest, NextResponse } from "next/server"

interface GoogleDirectionsRoute {
  summary?: string
  overview_polyline: { points: string }
  waypoint_order?: number[]
  legs: Array<{
    distance: { value: number }
  }>
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

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function findNearestPointOnPolyline(
  stopLat: number,
  stopLng: number,
  polyline: Array<{ lat: number; lng: number }>
): { nearestPoint: { lat: number; lng: number }; distance: number; cumulativeDistance: number } {
  let minDistance = Infinity
  let nearestPoint = polyline[0]
  let cumulativeDistance = 0
  let runningDistance = 0

  for (let i = 0; i < polyline.length - 1; i++) {
    const p1 = polyline[i]
    const p2 = polyline[i + 1]

    const distToP1 = calculateDistance(stopLat, stopLng, p1.lat, p1.lng)

    if (distToP1 < minDistance) {
      minDistance = distToP1
      nearestPoint = p1
      cumulativeDistance = runningDistance
    }

    runningDistance += calculateDistance(p1.lat, p1.lng, p2.lat, p2.lng)
  }

  const distToLast = calculateDistance(stopLat, stopLng, polyline[polyline.length - 1].lat, polyline[polyline.length - 1].lng)
  if (distToLast < minDistance) {
    minDistance = distToLast
    nearestPoint = polyline[polyline.length - 1]
    cumulativeDistance = runningDistance
  }

  return {
    nearestPoint,
    distance: minDistance,
    cumulativeDistance,
  }
}

function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const poly: Array<{ lat: number; lng: number }> = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    let b
    let shift = 0
    let result = 0

    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)

    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1
    lat += dlat

    shift = 0
    result = 0

    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)

    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1
    lng += dlng

    poly.push({
      lat: lat / 1e5,
      lng: lng / 1e5,
    })
  }

  return poly
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { stops, origin, destination, waypoints, minSpacingKm = 50, rigType, avoidGravelRoads } = body

    if (!stops || !Array.isArray(stops) || stops.length === 0) {
      return NextResponse.json({
        success: true,
        sortedStops: [],
      })
    }

    let polylinePoints: Array<{ lat: number; lng: number }> = []

    if (waypoints && waypoints.length > 0) {
      const apiKey = process.env.NEXT_PUBLIC_GMAPS_API_KEY
      if (!apiKey) {
        return NextResponse.json(
          { success: false, error: "Google Maps API key not configured" },
          { status: 500 }
        )
      }

      let waypointStr = ""
      if (waypoints.length === 1) {
        waypointStr = `waypoints=${waypoints[0].lat},${waypoints[0].lng}`
      } else {
        waypointStr = `waypoints=optimize:true|${waypoints.map((w: { lat: number; lng: number }) => `${w.lat},${w.lng}`).join("|")}`
      }

      const urlParams = new URLSearchParams({
        origin: `${origin.lat},${origin.lng}`,
        destination: `${destination.lat},${destination.lng}`,
        mode: "driving",
        key: apiKey,
      })

      const normalizedRig = String(rigType || "").toLowerCase()
      if (["caravan", "motorhome", "campervan"].includes(normalizedRig)) {
        urlParams.append("avoid", "ferries")
      }

      if (avoidGravelRoads === true && (!waypoints || waypoints.length === 0)) {
        urlParams.append("alternatives", "true")
      }

      if (waypointStr) {
        const waypointValue = waypointStr.replace(/^waypoints=/, "")
        urlParams.append("waypoints", waypointValue)
      }

      const url = `https://maps.googleapis.com/maps/api/directions/json?${urlParams.toString()}`

      const response = await fetch(url)
      const data = await response.json()

      if (data.status !== "OK" || !data.routes?.length) {
        return NextResponse.json(
          { success: false, error: "Failed to get route directions" },
          { status: 500 }
        )
      }

      const selectedRoute = selectBestDirectionsRoute(data.routes as GoogleDirectionsRoute[])
      const encodedPolyline = selectedRoute.overview_polyline.points
      polylinePoints = decodePolyline(encodedPolyline)

      const waypointOrder = selectedRoute.waypoint_order || []

      const stopsWithRouteDistance = stops.map((stop, index) => {
        const stopLat = parseFloat(stop.latitude)
        const stopLng = parseFloat(stop.longitude)

        let cumulativeDistance = 0
        let distanceFromRoute = calculateDistance(origin.lat, origin.lng, stopLat, stopLng)

        if (polylinePoints.length > 2) {
          const { distance, cumulativeDistance: cumDist } = findNearestPointOnPolyline(
            stopLat,
            stopLng,
            polylinePoints
          )
          cumulativeDistance = cumDist
          distanceFromRoute = distance
        } else {
          cumulativeDistance = calculateDistance(origin.lat, origin.lng, stopLat, stopLng)
        }

        return {
          id: stop.id,
          name: stop.location_name,
          lat: stopLat,
          lng: stopLng,
          routeDistance: cumulativeDistance,
          distanceFromRoute: distanceFromRoute,
          originalIndex: index,
        }
      })

      const sortedStops: Array<{
        id: string
        name: string
        lat: number
        lng: number
        routeDistance: number
        order: number
      }> = []

      if (waypointOrder.length > 0) {
        for (let i = 0; i < waypointOrder.length; i++) {
          const waypointIndex = waypointOrder[i]
          if (waypointIndex < stopsWithRouteDistance.length) {
            const stop = stopsWithRouteDistance[waypointIndex]
            sortedStops.push({
              id: stop.id,
              name: stop.name,
              lat: stop.lat,
              lng: stop.lng,
              routeDistance: Math.round(stop.routeDistance * 10) / 10,
              order: sortedStops.length + 1,
            })
          }
        }
      } else {
        stopsWithRouteDistance.sort((a, b) => a.routeDistance - b.routeDistance)

        let lastDistance = -minSpacingKm

        for (const stop of stopsWithRouteDistance) {
          if (stop.routeDistance >= lastDistance + minSpacingKm) {
            sortedStops.push({
              id: stop.id,
              name: stop.name,
              lat: stop.lat,
              lng: stop.lng,
              routeDistance: Math.round(stop.routeDistance * 10) / 10,
              order: sortedStops.length + 1,
            })
            lastDistance = stop.routeDistance
          }
        }
      }

      return NextResponse.json({
        success: true,
        sortedStops,
      })
    } else {
      polylinePoints = [
        { lat: origin.lat, lng: origin.lng },
        { lat: destination.lat, lng: destination.lng },
      ]

      const stopsWithRouteDistance = stops.map((stop) => {
        const stopLat = parseFloat(stop.latitude)
        const stopLng = parseFloat(stop.longitude)
        const cumulativeDistance = calculateDistance(origin.lat, origin.lng, stopLat, stopLng)
        const distanceFromRoute = calculateDistance(origin.lat, origin.lng, stopLat, stopLng)

        return {
          id: stop.id,
          name: stop.location_name,
          lat: stopLat,
          lng: stopLng,
          routeDistance: cumulativeDistance,
          distanceFromRoute: distanceFromRoute,
        }
      })

      stopsWithRouteDistance.sort((a, b) => a.routeDistance - b.routeDistance)

      const sortedStops: Array<{
        id: string
        name: string
        lat: number
        lng: number
        routeDistance: number
        order: number
      }> = []

      let lastDistance = -minSpacingKm

      for (const stop of stopsWithRouteDistance) {
        if (stop.routeDistance >= lastDistance + minSpacingKm) {
          sortedStops.push({
            id: stop.id,
            name: stop.name,
            lat: stop.lat,
            lng: stop.lng,
            routeDistance: Math.round(stop.routeDistance * 10) / 10,
            order: sortedStops.length + 1,
          })
          lastDistance = stop.routeDistance
        }
      }

      return NextResponse.json({
        success: true,
        sortedStops,
      })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
