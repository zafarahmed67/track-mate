"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { LoadScript, GoogleMap, Marker, DirectionsRenderer } from "@react-google-maps/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TripStops } from "@/components/planner/trip-stops"
import type { Stop } from "@/lib/types"
import {
  Route,
  Calendar,
  Clock,
  MapPin,
  ArrowLeft,
  Edit,
  Plus,
  Navigation,
} from "lucide-react"

const mapContainerStyle = {
  width: "100%",
  height: "100%",
}

interface TripData {
  id: string
  title: string
  start_location_text: string
  destination_text: string
  start_lat: number | null
  start_lng: number | null
  destination_lat: number | null
  destination_lng: number | null
  status: string
  trip_duration_days: number
  travel_pace: string
  created_at: string
}

interface TripStop extends Stop {
  distance_to_route_km?: number
  stop?: Stop
}

export default function PlannerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const tripId = params.tripId as string
  const [map, setMap] = useState<google.maps.Map | null>(null)
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null)

  const [loading, setLoading] = useState(true)
  const [trip, setTrip] = useState<TripData | null>(null)
  const [stops, setStops] = useState<TripStop[]>([])
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null)

  const calculateRoute = useCallback((mapInstance: google.maps.Map) => {
    if (!trip || !stops.length) return

    const waypoints = stops.slice(0, 23).map((stop) => ({
      location: new google.maps.LatLng(parseFloat(stop.latitude), parseFloat(stop.longitude)),
      stopover: true,
    }))

    const origin = new google.maps.LatLng(trip.start_lat!, trip.start_lng!)
    const destination = new google.maps.LatLng(trip.destination_lat!, trip.destination_lng!)

    const directionsService = new google.maps.DirectionsService()

    directionsService.route(
      {
        origin: origin,
        destination: destination,
        waypoints: waypoints,
        optimizeWaypoints: false,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          setDirections(result)
        } else {
          console.error("Directions request failed:", status)
        }
      }
    )
  }, [trip, stops])

  useEffect(() => {
    if (map && trip && stops.length > 0) {
      calculateRoute(map)
    }
  }, [map, trip, stops, calculateRoute])

  useEffect(() => {
    async function fetchTripData() {
      if (!tripId) return

      try {
        const response = await fetch(`/api/trips/${tripId}`)
        const data = await response.json()

        if (data.success && data.trip) {
          setTrip(data.trip)
        }

        const stopsResponse = await fetch(`/api/trips/${tripId}/stops`)
        const stopsData = await stopsResponse.json()
        console.log("Stops API response:", stopsData)

        if (stopsData.success && stopsData.stops && Array.isArray(stopsData.stops)) {
          const formattedStops = stopsData.stops.map(
            (item: { stop?: Stop; distance_to_route_km?: number }) => ({
              ...(item.stop || item),
              distance_to_route_km: item.distance_to_route_km,
            })
          )
          console.log("Formatted stops:", formattedStops)
          setStops(formattedStops)
        }
      } catch (error) {
        console.error("Error fetching trip:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchTripData()
  }, [tripId])

  const mapCenter = useMemo(() => {
    if (trip?.start_lat && trip?.start_lng) {
      return { lat: trip.start_lat, lng: trip.start_lng }
    }
    return { lat: -25.2744, lng: 133.7751 }
  }, [trip])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="relative h-20 w-20 mx-auto mb-6">
            <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <Route className="h-8 w-8 animate-spin text-primary" />
            </div>
          </div>
          <p className="text-muted-foreground">Loading your trip...</p>
        </div>
      </div>
    )
  }

  if (!trip) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
              <MapPin className="h-8 w-8 text-destructive/60" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Trip Not Found</h2>
            <p className="text-muted-foreground mb-6">
              The requested trip could not be found or may have been deleted.
            </p>
            <Button onClick={() => router.push("/planner/new")} className="group">
              <Plus className="mr-2 h-4 w-4" />
              Create New Trip
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="border-b bg-background/80 backdrop-blur-md sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push("/planner")}
                className="shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-xl font-bold truncate">{trip.title}</h1>
                  <Badge
                    variant="outline"
                    className="bg-primary/5 border-primary/20 shrink-0"
                  >
                    {trip.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {trip.start_location_text} → {trip.destination_text}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" onClick={() => router.push("/planner")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button className="group">
                <Edit className="mr-2 h-4 w-4" />
                Edit Trip
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
          <div className="space-y-6">
            <Card className="overflow-hidden border-2">
              <div className="bg-muted/30 px-6 py-4 border-b">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <Route className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold">Route Map</h2>
                    <p className="text-sm text-muted-foreground">
                      {trip.start_location_text} to {trip.destination_text}
                    </p>
                  </div>
                </div>
              </div>
              <CardContent className="p-0">
                <div className="h-[450px] bg-muted/20">
                  <LoadScript
                    googleMapsApiKey={process.env.NEXT_PUBLIC_GMAPS_API_KEY!}
                    libraries={["places"]}
                  >
                    <GoogleMap
                      mapContainerStyle={mapContainerStyle}
                      center={mapCenter}
                      zoom={5}
                      onLoad={(map) => setMap(map)}
                      options={{
                        disableDefaultUI: false,
                        zoomControl: true,
                        mapTypeControl: false,
                        streetViewControl: false,
                        fullscreenControl: true,
                      }}
                    >
                      {directions && (
                        <DirectionsRenderer
                          directions={directions}
                          options={{
                            suppressMarkers: true,
                            polylineOptions: {
                              strokeColor: "#2563eb",
                              strokeOpacity: 0.8,
                              strokeWeight: 4,
                            },
                          }}
                        />
                      )}

                      {trip.start_lat && trip.start_lng && (
                        <Marker
                          position={{
                            lat: trip.start_lat,
                            lng: trip.start_lng,
                          }}
                          label={{
                            text: "A",
                            color: "white",
                            fontWeight: "bold",
                          }}
                          title={trip.start_location_text}
                        />
                      )}

                      {trip.destination_lat && trip.destination_lng && (
                        <Marker
                          position={{
                            lat: trip.destination_lat,
                            lng: trip.destination_lng,
                          }}
                          label={{
                            text: "B",
                            color: "white",
                            fontWeight: "bold",
                          }}
                          title={trip.destination_text}
                        />
                      )}

                      {stops.map((stop, index) => {
                        const lat = parseFloat(stop.latitude)
                        const lng = parseFloat(stop.longitude)
                        if (isNaN(lat) || isNaN(lng)) return null
                        return (
                          <Marker
                            key={stop.id}
                            position={{ lat, lng }}
                            label={{
                              text: String(index + 1),
                              color: "white",
                              fontWeight: "bold",
                              fontSize: "11px",
                            }}
                            title={stop.location_name}
                          />
                        )
                      })}
                    </GoogleMap>
                  </LoadScript>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-2">
              <div className="bg-muted/30 px-6 py-4 border-b">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Navigation className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold">Trip Details</h2>
                    <p className="text-sm text-muted-foreground">
                      Your trip summary
                    </p>
                  </div>
                </div>
              </div>
              <CardContent className="p-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>Duration</span>
                    </div>
                    <p className="text-2xl font-bold">{trip.trip_duration_days}</p>
                    <p className="text-xs text-muted-foreground">days</p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>Pace</span>
                    </div>
                    <p className="text-2xl font-bold capitalize">
                      {trip.travel_pace || "Standard"}
                    </p>
                    <p className="text-xs text-muted-foreground">travel style</p>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t space-y-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <MapPin className="h-4 w-4" />
                      <span>Start Location</span>
                    </div>
                    <p className="font-semibold">{trip.start_location_text}</p>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <MapPin className="h-4 w-4" />
                      <span>Destination</span>
                    </div>
                    <p className="font-semibold">{trip.destination_text}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <TripStops stops={stops} />
          </div>
        </div>
      </div>
    </main>
  )
}
