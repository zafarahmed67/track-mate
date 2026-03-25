"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  MapPin,
  Navigation,
  Fuel,
  Utensils,
  Coffee,
  Wrench,
  ShoppingCart,
  Waves,
  RefreshCw,
  Locate,
  Clock,
  ArrowRight,
  Car,
} from "lucide-react"

interface TripStop {
  id: string
  location_name: string
  nearest_town?: string
  state?: string
  latitude: string
  longitude: string
  stop_type?: string
}

interface NearbyPlace {
  name: string
  lat: number
  lng: number
  address: string
  type: string
  rating?: number
  isOpenNow?: boolean
}

interface LiveTrackingProps {
  stops: TripStop[]
  onLocationUpdate?: (lat: number, lng: number) => void
  onDirectionsUpdate?: (origin: string, destination: string, waypoint?: string) => void
  center?: { lat: number; lng: number }
  onCenterChange?: (center: { lat: number; lng: number }) => void
}

export function LiveTracking({ stops, onLocationUpdate, onDirectionsUpdate, center, onCenterChange }: LiveTrackingProps) {
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([])
  const [loadingPlaces, setLoadingPlaces] = useState(false)
  const [nextStop, setNextStop] = useState<TripStop | null>(null)
  const [watchId, setWatchId] = useState<number | null>(null)
  const [followMe, setFollowMe] = useState(true)

  useEffect(() => {
    if (currentLocation && followMe && onCenterChange) {
      onCenterChange(currentLocation)
    }
  }, [currentLocation, followMe, onCenterChange])

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
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

  const findNextStop = useCallback((lat: number, lng: number) => {
    if (!stops.length) return null

    let nearestStop = null
    let minDistance = Infinity

    for (const stop of stops) {
      const stopLat = parseFloat(stop.latitude)
      const stopLng = parseFloat(stop.longitude)
      if (isNaN(stopLat) || isNaN(stopLng)) continue

      const distance = calculateDistance(lat, lng, stopLat, stopLng)
      if (distance < minDistance) {
        minDistance = distance
        nearestStop = stop
      }
    }

    return nearestStop
  }, [stops])

  const loadNearbyPlaces = async (lat: number, lng: number) => {
    setLoadingPlaces(true)
    try {
      const response = await fetch(
        `/api/places/nearby?lat=${lat}&lng=${lng}&types=gas_station,restaurant,cafe,car_repair,car_wash,pharmacy,supermarket,food,meal_takeaway&radius=5000`
      )
      const data = await response.json()

      if (data.success && data.places) {
        setNearbyPlaces(data.places)
      }
    } catch (error) {
      console.error("Error loading nearby places:", error)
    } finally {
      setLoadingPlaces(false)
    }
  }

  const startLocationTracking = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser")
      return
    }

    setIsLocating(true)
    setLocationError(null)

    const id = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setCurrentLocation({ lat: latitude, lng: longitude })
        onLocationUpdate?.(latitude, longitude)

        const next = findNextStop(latitude, longitude)
        setNextStop(next)

        loadNearbyPlaces(latitude, longitude)
        setIsLocating(false)
      },
      (error) => {
        setLocationError(error.message)
        setIsLocating(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    )

    setWatchId(id)
  }

  const stopLocationTracking = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId)
      setWatchId(null)
    }
  }

  const getCurrentLocationOnce = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser")
      return
    }

    setIsLocating(true)
    setLocationError(null)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setCurrentLocation({ lat: latitude, lng: longitude })
        onLocationUpdate?.(latitude, longitude)

        const next = findNextStop(latitude, longitude)
        setNextStop(next)

        loadNearbyPlaces(latitude, longitude)
        setIsLocating(false)
      },
      (error) => {
        setLocationError(error.message)
        setIsLocating(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    )
  }

  const getPlaceIcon = (type: string) => {
    switch (type) {
      case "gas_station":
        return <Fuel className="h-4 w-4 text-orange-500" />
      case "restaurant":
        return <Utensils className="h-4 w-4 text-red-500" />
      case "cafe":
        return <Coffee className="h-4 w-4 text-amber-600" />
      case "car_repair":
      case "car_wash":
        return <Wrench className="h-4 w-4 text-blue-500" />
      case "supermarket":
      case "food":
      case "meal_takeaway":
        return <ShoppingCart className="h-4 w-4 text-green-500" />
      case "pharmacy":
        return <Waves className="h-4 w-4 text-purple-500" />
      default:
        return <MapPin className="h-4 w-4 text-gray-500" />
    }
  }

  const formatPlaceType = (type: string) => {
    return type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
  }

  const getDirectionsToNextStop = () => {
    if (!currentLocation || !nextStop) return

    const origin = `${currentLocation.lat},${currentLocation.lng}`
    const destination = `${nextStop.latitude},${nextStop.longitude}`

    onDirectionsUpdate?.(origin, destination)
  }

  useEffect(() => {
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId)
      }
    }
  }, [watchId])

  const groupedPlaces = nearbyPlaces.reduce((acc, place) => {
    const category = place.type.split("_")[0]
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(place)
    return acc
  }, {} as Record<string, NearbyPlace[]>)

  return (
    <div className="space-y-6">
      <Card className="border-2 overflow-hidden">
        <div className="bg-gradient-to-r from-green-600 to-green-500 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
                <Locate className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-lg">Live Tracking</h2>
                <p className="text-white/80 text-sm">
                  {currentLocation
                    ? "Location tracking active"
                    : "Track your current position"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {currentLocation && (
                <Badge className="bg-white/20 text-white border-0 animate-pulse">
                  <Navigation className="h-3 w-3 mr-1" />
                  Live
                </Badge>
              )}
            </div>
          </div>
        </div>
        <CardContent className="p-4 space-y-4">
          {locationError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
              <MapPin className="h-4 w-4 inline mr-2" />
              {locationError}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={getCurrentLocationOnce}
              disabled={isLocating}
              className="flex-1"
            >
              {isLocating ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <MapPin className="h-4 w-4 mr-2" />
              )}
              {isLocating ? "Getting Location..." : "Get Current Location"}
            </Button>
            {currentLocation && (
              <Button
                variant={followMe ? "default" : "outline"}
                size="icon"
                onClick={() => setFollowMe(!followMe)}
                title={followMe ? "Stop following" : "Follow my location"}
              >
                <Navigation className={`h-4 w-4 ${followMe ? "animate-pulse" : ""}`} />
              </Button>
            )}
          </div>

          {currentLocation && (
            <div className="text-xs text-muted-foreground text-center">
              📍 {currentLocation.lat.toFixed(5)}, {currentLocation.lng.toFixed(5)}
            </div>
          )}
        </CardContent>
      </Card>

      {currentLocation && nextStop && (
        <Card className="border-2 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
                  <Navigation className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-white font-bold text-lg">Next Stop</h2>
                  <p className="text-white/80 text-sm">
                    {calculateDistance(
                      currentLocation.lat,
                      currentLocation.lng,
                      parseFloat(nextStop.latitude),
                      parseFloat(nextStop.longitude)
                    ).toFixed(1)} km away
                  </p>
                </div>
              </div>
            </div>
          </div>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-background">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <ArrowRight className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{nextStop.location_name}</p>
                <p className="text-xs text-muted-foreground">
                  {nextStop.nearest_town}, {nextStop.state}
                </p>
              </div>
              <Button size="sm" onClick={getDirectionsToNextStop}>
                <Car className="h-4 w-4 mr-2" />
                Navigate
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-2">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Nearby Places
            </CardTitle>
            {loadingPlaces && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!currentLocation ? (
            <div className="text-center py-8 text-muted-foreground px-4">
              <MapPin className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Get your location to see nearby places</p>
            </div>
          ) : loadingPlaces ? (
            <div className="text-center py-8 text-muted-foreground">
              <RefreshCw className="h-8 w-8 mx-auto mb-3 animate-spin" />
              <p>Finding nearby places...</p>
            </div>
          ) : nearbyPlaces.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground px-4">
              <p>No nearby places found</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="p-4 space-y-4">
                {Object.entries(groupedPlaces).map(([category, places]) => (
                  <div key={category}>
                    <div className="text-sm font-medium text-muted-foreground mb-2 capitalize">
                      {formatPlaceType(category)}s
                    </div>
                    <div className="space-y-2">
                      {places.slice(0, 5).map((place, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-3 p-2 rounded-lg border bg-background hover:bg-muted/50 transition-colors"
                        >
                          {getPlaceIcon(place.type)}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{place.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {place.address}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {place.rating && place.rating > 0 && (
                              <Badge variant="outline" className="text-xs">
                                ★ {place.rating}
                              </Badge>
                            )}
                            {place.isOpenNow && (
                              <Badge className="bg-green-500 text-xs">Open</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border">
          <CardContent className="p-3 text-center">
            <Fuel className="h-5 w-5 mx-auto mb-1 text-orange-500" />
            <p className="text-xs text-muted-foreground">
              {nearbyPlaces.filter((p) => p.type.includes("gas")).length}
            </p>
            <p className="text-xs font-medium">Petrol Pumps</p>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-3 text-center">
            <Utensils className="h-5 w-5 mx-auto mb-1 text-red-500" />
            <p className="text-xs text-muted-foreground">
              {nearbyPlaces.filter((p) => p.type.includes("restaurant") || p.type.includes("food")).length}
            </p>
            <p className="text-xs font-medium">Restaurants</p>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-3 text-center">
            <ShoppingCart className="h-5 w-5 mx-auto mb-1 text-green-500" />
            <p className="text-xs text-muted-foreground">
              {nearbyPlaces.filter((p) => p.type.includes("supermarket")).length}
            </p>
            <p className="text-xs font-medium">Supermarkets</p>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-3 text-center">
            <Wrench className="h-5 w-5 mx-auto mb-1 text-blue-500" />
            <p className="text-xs text-muted-foreground">
              {nearbyPlaces.filter((p) => p.type.includes("car_repair") || p.type.includes("car_wash")).length}
            </p>
            <p className="text-xs font-medium">Car Services</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
