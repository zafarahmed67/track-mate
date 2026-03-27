"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { LoadScript, GoogleMap, Marker, DirectionsRenderer } from "@react-google-maps/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { StopFilters } from "@/components/planner/stop-filters"
import { TripPlannerUI } from "@/components/planner/trip-planner-ui"
import { StopOptions } from "@/components/planner/stop-options"
import type { Stop } from "@/lib/types"
import { getStoredUser } from "@/lib/auth"
import {
  Route,
  MapPin,
  ArrowLeft,
  Edit,
  Plus,
  Save,
  Download,
  Trash2,
  Clock,
  Gauge,
  Car,
  ChevronDown,
  ChevronUp,
  Fuel,
  Utensils,
  Coffee,
  Wrench,
  ShoppingCart,
  TreePine,
  Waves,
  RefreshCw,
  ArrowUp,
  ArrowDown,
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
  notes: string | null
}

interface TripStop extends Omit<Stop, "id"> {
  id: string
  stop_id?: string
  distance_to_route_km?: number
  stop?: Stop
  stop_type?: string
  address?: string
  day_index?: number
  routeDistance?: number
}

export default function PlannerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const tripId = params.tripId as string
  const [userId, setUserId] = useState<string | null>(null)
  const [map, setMap] = useState<google.maps.Map | null>(null)
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null)

  const [loading, setLoading] = useState(true)
  const [trip, setTrip] = useState<TripData | null>(null)
  const [stops, setStops] = useState<TripStop[]>([])
  const [filteredStops, setFilteredStops] = useState<TripStop[]>([])
  const [selectedStops, setSelectedStops] = useState<string[]>([])
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null)
  const [fuelStations, setFuelStations] = useState<Array<{
    id: string
    name: string
    lat: number
    lng: number
    address: string
    isOpenNow?: boolean
    rating?: number
  }>>([])
  const [fuelLoading, setFuelLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [activeDayTab, setActiveDayTab] = useState<number>(0)
  const [routeDetails, setRouteDetails] = useState<Record<number, { distanceText: string; durationText: string }>>({})
  const [nearbyPlaces, setNearbyPlaces] = useState<Record<number, Array<{
    name: string
    lat: number
    lng: number
    address: string
    type: string
    rating?: number
    isOpenNow?: boolean
  }>>>({})
  const [loadingPlaces, setLoadingPlaces] = useState<Set<number>>(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; stopId: string | null; stopName: string }>({ show: false, stopId: null, stopName: "" })
  const [showAddPlace, setShowAddPlace] = useState<number | null>(null)
  const [selectedStopForDelete, setSelectedStopForDelete] = useState<{ id: string; name: string } | null>(null)
  const [sortingStops, setSortingStops] = useState(false)

  const toggleDayExpansion = async (dayIndex: number) => {
    setActiveDayTab(dayIndex)
    
    if (!routeDetails[dayIndex]) {
      const stopsPerDay = Math.ceil(filteredStops.length / (trip?.trip_duration_days || 1))
      const dayStops = filteredStops.slice(
        dayIndex * stopsPerDay,
        (dayIndex + 1) * stopsPerDay
      )

      const dayDuration = trip?.trip_duration_days || 1
      let origin: string
      let destination: string

      if (dayIndex === 0) {
        origin = trip?.start_location_text || ""
        destination = dayStops.length > 0 
          ? `${dayStops[0].latitude},${dayStops[0].longitude}`
          : trip?.destination_text || ""
      } else if (dayIndex === dayDuration - 1) {
        const prevDayStops = filteredStops.slice(
          (dayIndex - 1) * stopsPerDay,
          dayIndex * stopsPerDay
        )
        origin = prevDayStops.length > 0 
          ? `${prevDayStops[prevDayStops.length - 1].latitude},${prevDayStops[prevDayStops.length - 1].longitude}`
          : `${trip?.start_lat},${trip?.start_lng}`
        destination = trip?.destination_text || ""
      } else {
        const prevDayStops = filteredStops.slice(
          (dayIndex - 1) * stopsPerDay,
          dayIndex * stopsPerDay
        )
        origin = prevDayStops.length > 0 
          ? `${prevDayStops[prevDayStops.length - 1].latitude},${prevDayStops[prevDayStops.length - 1].longitude}`
          : `${trip?.start_lat},${trip?.start_lng}`
        destination = dayStops.length > 0 
          ? `${dayStops[0].latitude},${dayStops[0].longitude}`
          : trip?.destination_text || ""
      }

      try {
        const waypointsParam = dayStops.length > 1 
          ? dayStops.slice(0, -1).map(s => `${s.latitude},${s.longitude}`).join("|")
          : undefined
        
        const url = waypointsParam
          ? `/api/places/route-details?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&waypoints=${encodeURIComponent(waypointsParam)}`
          : `/api/places/route-details?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`
        
        const response = await fetch(url)
        const data = await response.json()

        if (data.success && data.route) {
          setRouteDetails(prev => ({
            ...prev,
            [dayIndex]: {
              distanceText: data.route.distanceText,
              durationText: data.route.durationText,
            }
          }))
        }
      } catch (error) {
        console.error("Error fetching route details:", error)
      }

      if (!nearbyPlaces[dayIndex]) {
        setLoadingPlaces(prev => new Set(prev).add(dayIndex))
        
        const midLat = dayStops.length > 0 
          ? parseFloat(dayStops[Math.floor(dayStops.length / 2)]?.latitude || "0")
          : (trip?.start_lat || -25.2744)
        const midLng = dayStops.length > 0 
          ? parseFloat(dayStops[Math.floor(dayStops.length / 2)]?.longitude || "0")
          : (trip?.start_lng || 133.7751)

        try {
          const response = await fetch(
            `/api/places/nearby?lat=${midLat}&lng=${midLng}&types=gas_station,restaurant,cafe,car_repair,car_wash,pharmacy,supermarket,campground,rv_park,point_of_interest,tourist_attraction`
          )
          const data = await response.json()

          if (data.success && data.places) {
            setNearbyPlaces(prev => ({
              ...prev,
              [dayIndex]: data.places
            }))
          }
        } catch (error) {
          console.error("Error fetching nearby places:", error)
        } finally {
          setLoadingPlaces(prev => {
            const newSet = new Set(prev)
            newSet.delete(dayIndex)
            return newSet
          })
        }
      }
    }
  }

  const handleDeleteStopClick = (stopId: string, stopName: string) => {
    setSelectedStopForDelete({ id: stopId, name: stopName })
  }

  const confirmDeleteStop = async () => {
    if (!selectedStopForDelete) return
    
    try {
      const stopToDelete = stops.find(s => s.id === selectedStopForDelete.id)
      const isCustomStop = stopToDelete?.verification_status === "custom"
      
      let response, result
      
      if (isCustomStop) {
        response = await fetch(`/api/custom-stops?id=${selectedStopForDelete.id}`, {
          method: "DELETE",
        })
      } else {
        response = await fetch(`/api/trips/${tripId}/stops?id=${selectedStopForDelete.id}`, {
          method: "DELETE",
        })
      }
      
      result = await response.json()
      
      if (!result.success) {
        console.error("Failed to remove stop:", result.error)
        return
      }
      
      const newStops = stops.filter((s) => s.id !== selectedStopForDelete.id)
      setStops(newStops)
      setFilteredStops(newStops)
      setSelectedStops((prev) => prev.filter((id) => id !== selectedStopForDelete.id))
      toast.success("Stop removed from trip")
    } catch (error) {
      console.error("Error removing stop:", error)
    } finally {
      setSelectedStopForDelete(null)
    }
  }

  const handleLoadFuelStations = async () => {
    if (!trip?.start_location_text || !trip?.destination_text) return

    setFuelLoading(true)
    try {
      const response = await fetch(
        `/api/places/fuel-along-route?origin=${encodeURIComponent(trip.start_location_text)}&destination=${encodeURIComponent(trip.destination_text)}`
      )
      const data = await response.json()

      if (data.success && data.fuelStations) {
        setFuelStations(data.fuelStations.map((s: { name: string; lat: number; lng: number; address: string; isOpenNow?: boolean; rating?: number }, i: number) => ({
          id: `fuel-${i}`,
          name: s.name,
          lat: s.lat,
          lng: s.lng,
          address: s.address,
          isOpenNow: s.isOpenNow,
          rating: s.rating,
        })))
      }
    } catch (error) {
      console.error("Error loading fuel stations:", error)
    } finally {
      setFuelLoading(false)
    }
  }

  const handleAddFuelStation = (station: {
    name: string
    lat: number
    lng: number
    address: string
    placeId?: string
  }) => {
    const id = station.placeId || `${station.lat},${station.lng}`
    setFuelStations((prev) => [
      ...prev,
      { id, name: station.name, lat: station.lat, lng: station.lng, address: station.address },
    ])
  }

  const handleRemoveFuelStation = (id: string) => {
    setFuelStations((prev) => prev.filter((s) => s.id !== id))
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
        return <Wrench className="h-4 w-4 text-blue-500" />
      case "supermarket":
        return <ShoppingCart className="h-4 w-4 text-green-500" />
      case "campground":
      case "rv_park":
        return <TreePine className="h-4 w-4 text-green-600" />
      default:
        return <MapPin className="h-4 w-4 text-gray-500" />
    }
  }

  const handleSaveTrip = async () => {
    setSaving(true)
    try {
      const response = await fetch(`/api/trips/${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "saved", userId }),
      })
      const result = await response.json()

      if (result.success) {
        setTrip((prev) => prev ? { ...prev, status: "saved" } : null)
      } else {
        console.error("Failed to save trip:", result.error)
      }
    } catch (error) {
      console.error("Error saving trip:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleExportPdf = async () => {
    try {
      const response = await fetch(`/api/trips/${tripId}/export?format=html${userId ? `&user_id=${userId}` : ""}`)
      const data = await response.json()

      if (data.success) {
        const printWindow = window.open("", "_blank")
        if (printWindow) {
          printWindow.document.write(data.data)
          printWindow.document.close()
          printWindow.print()
        }
      }
    } catch (error) {
      console.error("Error exporting trip:", error)
    }
  }

  const handleDeleteTrip = async () => {
    setDeleting(true)
    try {
      const response = await fetch(`/api/trips/${tripId}${userId ? `?user_id=${userId}` : ""}`, {
        method: "DELETE",
      })
      const result = await response.json()

      if (result.success) {
        router.push("/planner")
      } else {
        console.error("Failed to delete trip:", result.error)
        setShowDeleteConfirm(false)
      }
    } catch (error) {
      console.error("Error deleting trip:", error)
    } finally {
      setDeleting(false)
    }
  }

  const handleSelectStop = (stopId: string, selected: boolean) => {
    setSelectedStops((prev) =>
      selected ? [...prev, stopId] : prev.filter((id) => id !== stopId)
    )
  }

  const handleSelectAllStops = (selected: boolean) => {
    if (selected) {
      setSelectedStops(filteredStops.map((s) => s.id))
    } else {
      setSelectedStops([])
    }
  }

  const handleAddStopFromOptions = async (stop: {
    id: string
    location_name: string
    latitude: string
    longitude: string
    state: string
    region: string
    route_type: string
    stay_type: string
    pet_friendly: string
    water: string
    cost_band: string
    tier: string
  }) => {
    const existingStop = stops.find(s => s.id === stop.id)
    
    if (existingStop) {
      toast.error("This stop is already in your trip")
      return
    }

    try {
      const response = await fetch(`/api/trips/${tripId}/stops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stop_ids: [stop.id],
          selected_by_ai: false,
        }),
      })
      const result = await response.json()

      if (result.success) {
        const newStop: TripStop = {
          id: stop.id,
          location_name: stop.location_name,
          latitude: stop.latitude,
          longitude: stop.longitude,
          state: stop.state,
          region: stop.region,
          route_type: stop.route_type,
          stay_type: stop.stay_type,
          pet_friendly: stop.pet_friendly,
          water: stop.water,
          cost_band: stop.cost_band,
          tier: stop.tier,
          nearest_town: "",
          rig_suitability: "",
          access_type: "",
          dump_point: "",
          best_season: "",
          why_we_d_stay_again: "",
          confidence_level: "",
          aao_tip: "",
          why_stop_here: "",
          best_travel_window: "",
          corridor: "",
          road_suitability: "",
          max_rig_length: "",
          verification_status: "",
          created_at: new Date().toISOString(),
        }
        
        const updatedStops = [...stops, newStop]
        const sortedStops = await sortStopsAlongRoute(updatedStops)
        
        setStops(sortedStops)
        setFilteredStops(sortedStops)
        toast.success(`${stop.location_name} added to trip`)
      } else {
        toast.error("Failed to add stop")
      }
    } catch (error) {
      console.error("Error adding stop:", error)
      toast.error("Error adding stop")
    }
  }

  const handleRemoveStopFromOptions = async (stopId: string) => {
    try {
      const response = await fetch(`/api/trips/${tripId}/stops?id=${stopId}`, {
        method: "DELETE",
      })
      const result = await response.json()
      
      if (result.success) {
        const newStops = stops.filter((s) => s.id !== stopId)
        setStops(newStops)
        setFilteredStops(newStops)
        toast.success("Stop removed from trip")
      }
    } catch (error) {
      console.error("Error removing stop:", error)
    }
  }

  const handleAddPlaceToDay = async (dayIndex: number, place: { name: string; lat: number; lng: number; address: string; type: string }) => {
    const existingStop = stops.find(s => 
      s.location_name === place.name && 
      s.latitude === place.lat.toString() && 
      s.longitude === place.lng.toString()
    )
    
    if (existingStop) {
      toast.error("This place is already in your trip")
      return
    }

    try {
      const response = await fetch("/api/custom-stops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: tripId,
          user_id: userId,
          location_name: place.name,
          latitude: place.lat.toString(),
          longitude: place.lng.toString(),
          address: place.address,
          place_type: place.type,
          day_index: dayIndex,
        }),
      })
      const result = await response.json()

      if (result.success) {
        const newStop = {
          id: result.stop?.id,
          location_name: place.name,
          nearest_town: "",
          state: place.type,
          region: "",
          route_type: "",
          rig_suitability: "",
          access_type: "",
          water: "",
          dump_point: "",
          pet_friendly: "",
          best_season: "",
          stay_type: "",
          why_we_d_stay_again: "",
          confidence_level: "",
          tier: "",
          aao_tip: "",
          why_stop_here: "",
          best_travel_window: "",
          latitude: place.lat.toString(),
          longitude: place.lng.toString(),
          corridor: "",
          road_suitability: "",
          max_rig_length: "",
          cost_band: "",
          verification_status: "custom",
          day_index: dayIndex,
          created_at: new Date().toISOString(),
        }
        
        const updatedStops = [...stops, newStop as unknown as TripStop]
        const sortedStops = await sortStopsAlongRoute(updatedStops)
        
        setStops(sortedStops)
        setFilteredStops(sortedStops)
        setActiveDayTab(dayIndex)
        toast.success(`${place.name} added to trip`)
      } else {
        console.error("Failed to add stop:", result.error)
        toast.error("Failed to add place")
      }
    } catch (error) {
      console.error("Error adding place:", error)
      toast.error("Error adding place")
    }
    setShowAddPlace(null)
  }

  const sortStopsAlongRoute = async (stopsToSort: TripStop[], routeOrigin?: { lat: number; lng: number }, routeDestination?: { lat: number; lng: number }): Promise<TripStop[]> => {
    const origin = routeOrigin || (trip ? { lat: trip.start_lat, lng: trip.start_lng } : undefined)
    const destination = routeDestination || (trip ? { lat: trip.destination_lat, lng: trip.destination_lng } : undefined)
    
    if (!origin || !destination || stopsToSort.length === 0) return stopsToSort

    try {
      const response = await fetch("/api/stops/sort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stops: stopsToSort.map(s => ({
            id: s.id,
            latitude: s.latitude,
            longitude: s.longitude,
            location_name: s.location_name,
          })),
          origin,
          destination,
          waypoints: stopsToSort.map(s => ({
            lat: parseFloat(s.latitude),
            lng: parseFloat(s.longitude),
          })),
          minSpacingKm: 50,
        }),
      })

      const data = await response.json()
      console.log("Sort API response:", data)

      if (data.success && data.sortedStops && data.sortedStops.length > 0) {
        const sortedMap = new Map<string, number>()
        data.sortedStops.forEach((s: { id: string; order: number; routeDistance: number }) => {
          sortedMap.set(s.id, s.order)
        })
        
        return [...stopsToSort].sort((a, b) => {
          const orderA = sortedMap.get(a.id) ?? 999
          const orderB = sortedMap.get(b.id) ?? 999
          return orderA - orderB
        })
      }
    } catch (error) {
      console.error("Error sorting stops along route:", error)
    }

    return stopsToSort
  }

  const handleReorder = async (newStops: TripStop[]) => {
    const oldStops = [...stops]
    setStops(newStops)
    setFilteredStops(newStops)

    try {
      const stopOrders = newStops.map((stop, index) => ({
        id: stop.id,
        rank_score: 1 - (index * 0.0333),
      }))

      const response = await fetch(`/api/trips/${tripId}/stops`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stop_orders: stopOrders }),
      })
      const result = await response.json()

      if (!result.success) {
        console.error("Failed to reorder stops:", result.error)
        setStops(oldStops)
        setFilteredStops(oldStops)
      }
    } catch (error) {
      console.error("Error reordering stops:", error)
      setStops(oldStops)
      setFilteredStops(oldStops)
    }
  }

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
    const user = getStoredUser()
    if (user) setUserId(user.id)
  }, [])

  useEffect(() => {
    async function fetchTripData() {
      if (!tripId) return
      const storedUser = getStoredUser()
      const uid = storedUser?.id

      try {
        const response = await fetch(`/api/trips/${tripId}${uid ? `?user_id=${uid}` : ""}`)
        const data = await response.json()

        if (data.success && data.trip) {
          setTrip(data.trip)
        }

        const stopsResponse = await fetch(`/api/trips/${tripId}/stops`)
        const stopsData = await stopsResponse.json()
        console.log("Stops API response:", stopsData)

        let formattedStops: TripStop[] = []

        if (stopsData.success && stopsData.stops && Array.isArray(stopsData.stops)) {
          formattedStops = stopsData.stops.map(
            (item: { id?: string; stop?: Stop; stop_id?: string; distance_to_route_km?: number }) => ({
              id: item.id,
              stop_id: item.stop_id,
              ...(item.stop || item),
              distance_to_route_km: item.distance_to_route_km,
            })
          )
        }

        try {
          const customStopsResponse = await fetch(`/api/custom-stops?trip_id=${tripId}`)
          const customStopsData = await customStopsResponse.json()

          if (customStopsData.success && customStopsData.stops && Array.isArray(customStopsData.stops)) {
            const customFormattedStops = customStopsData.stops.map(
              (item: { id: string; location_name: string; latitude: string; longitude: string; address?: string; place_type?: string; day_index?: number }) => ({
                id: item.id,
                location_name: item.location_name,
                latitude: item.latitude,
                longitude: item.longitude,
                address: item.address || "",
                state: item.place_type || "",
                nearest_town: "",
                region: "",
                route_type: "",
                rig_suitability: "",
                access_type: "",
                water: "",
                dump_point: "",
                pet_friendly: "",
                best_season: "",
                stay_type: "",
                why_we_d_stay_again: "",
                confidence_level: "",
                tier: "",
                aao_tip: "",
                why_stop_here: "",
                best_travel_window: "",
                corridor: "",
                road_suitability: "",
                max_rig_length: "",
                cost_band: "",
                verification_status: "custom",
                day_index: item.day_index ?? 0,
                created_at: new Date().toISOString(),
              })
            )
            
            const existingIds = new Set(formattedStops.map((s: { id: string }) => s.id))
            const newCustomStops = customFormattedStops.filter((s: { id: string }) => !existingIds.has(s.id))
            
            formattedStops = [...formattedStops, ...newCustomStops]
          }
        } catch (err) {
          console.error("Error fetching custom stops:", err)
        }

        console.log("Formatted stops:", formattedStops)
        
        if (trip?.start_lat && trip?.start_lng && trip?.destination_lat && trip?.destination_lng) {
          const sortedStops = await sortStopsAlongRoute(formattedStops)
          setStops(sortedStops)
          setFilteredStops(sortedStops)
        } else {
          setStops(formattedStops)
          setFilteredStops(formattedStops)
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
              <Button variant="outline" size="sm" onClick={handleSaveTrip} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportPdf}>
                <Download className="mr-2 h-4 w-4" />
                Export PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
              <Button className="group">
                <Edit className="mr-2 h-4 w-4" />
                Edit Trip
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-4">
        <div className="mb-4">
          <Card className="overflow-hidden border py-0">
            <CardContent className="p-0">
              <div className="h-100 bg-muted/20">
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
                            strokeWeight: 5,
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

                    {filteredStops.map((stop, index) => {
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
                          title={`${index + 1}. ${stop.location_name}`}
                        />
                      )
                    })}

                    {fuelStations.map((station, index) => (
                      <Marker
                        key={station.id}
                        position={{ lat: station.lat, lng: station.lng }}
                        label={{
                          text: `F${index + 1}`,
                          color: "white",
                          fontWeight: "bold",
                          fontSize: "10px",
                        }}
                        title={station.name}
                      />
                    ))}
                  </GoogleMap>
                </LoadScript>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Trip Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Route</div>
                  <div className="flex items-center gap-2 text-lg font-medium">
                    <MapPin className="h-5 w-5 text-primary" />
                    {trip.start_location_text} → {trip.destination_text}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Total Distance</div>
                    <div className="flex items-center gap-2 font-semibold">
                      <Route className="h-4 w-4 text-muted-foreground" />
                      ~{Math.round((trip.trip_duration_days || 1) * 170)} km
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Duration</div>
                    <div className="flex items-center gap-2 font-semibold">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      {trip.trip_duration_days} days
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Pace</div>
                    <div className="flex items-center gap-2 font-semibold">
                      <Gauge className="h-4 w-4 text-muted-foreground" />
                      {trip.travel_pace || "Moderate"}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Trip Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Trip ID</span>
                <span className="font-mono text-xs">{trip.id.slice(0, 8)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Created</span>
                <span>{new Date(trip.created_at).toLocaleDateString()}</span>
              </div>
              {trip.notes && (
                <div className="pt-2 border-t">
                  <div className="text-sm text-muted-foreground mb-1">Notes</div>
                  <p className="text-sm">{trip.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>



        <div className="mt-8 grid grid-cols-5 gap-4 mb-4">
          <div className="col-span-3 space-y-3">
            <StopFilters stops={stops} onFilterChange={setFilteredStops} />
            {stops.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={async () => {
                  setSortingStops(true)
                  const sorted = await sortStopsAlongRoute(stops)
                  setStops(sorted)
                  setFilteredStops(sorted)
                  setSortingStops(false)
                  toast.success("Stops sorted along route")
                }}
                disabled={sortingStops}
              >
                {sortingStops ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Route className="h-4 w-4 mr-2" />
                )}
                Sort Along Route
              </Button>
            )}
          </div>
          <div className="col-span-2">
            <TripPlannerUI
              trip={{
                start_location_text: trip.start_location_text,
                destination_text: trip.destination_text,
                start_lat: trip.start_lat ?? undefined,
                start_lng: trip.start_lng ?? undefined,
                destination_lat: trip.destination_lat ?? undefined,
                destination_lng: trip.destination_lng ?? undefined,
              }}
              stops={filteredStops}
              fuelStations={fuelStations}
              onLoadFuelStations={handleLoadFuelStations}
              onAddFuelStation={handleAddFuelStation}
              onRemoveFuelStation={handleRemoveFuelStation}
              onRemoveStop={(id) => {
                const stop = stops.find(s => s.id === id)
                handleDeleteStopClick(id, stop?.location_name || "this stop")
              }}
              fuelLoading={fuelLoading}
            />
          </div>
        </div>

        <div className="mt-8">
          <StopOptions
            tripId={tripId}
            startLat={trip.start_lat ?? undefined}
            startLng={trip.start_lng ?? undefined}
            destLat={trip.destination_lat ?? undefined}
            destLng={trip.destination_lng ?? undefined}
            travelPace={trip.travel_pace || "moderate"}
            existingStopIds={stops.map(s => s.id)}
            onAddStop={handleAddStopFromOptions}
            onRemoveStop={handleRemoveStopFromOptions}
          />
        </div>

        {filteredStops.length > 0 && (
          <Card className="mb-8">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Day-by-Day Itinerary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                {Array.from({ length: trip.trip_duration_days || 1 }, (_, dayIndex) => (
                  <Button
                    key={dayIndex}
                    variant={activeDayTab === dayIndex ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleDayExpansion(dayIndex)}
                    className="shrink-0"
                  >
                    Day {dayIndex + 1}
                  </Button>
                ))}
              </div>

              {(() => {
                const dayIndex = activeDayTab
                const stopsPerDay = Math.ceil(filteredStops.length / (trip.trip_duration_days || 1))
                const dayStops = filteredStops.slice(
                  dayIndex * stopsPerDay,
                  (dayIndex + 1) * stopsPerDay
                )
                const routeInfo = routeDetails[dayIndex]
                const places = nearbyPlaces[dayIndex]
                const isLoading = loadingPlaces.has(dayIndex)

                const placeCategories = [
                  { key: "cafe", label: "Cafes", icon: Coffee },
                  { key: "restaurant", label: "Restaurants", icon: Utensils },
                  { key: "gas_station", label: "Petrol Pumps", icon: Fuel },
                  { key: "car_repair", label: "Car Services", icon: Wrench },
                  { key: "car_wash", label: "Car Wash", icon: Car },
                  { key: "pharmacy", label: "Pharmacy", icon: Waves },
                  { key: "supermarket", label: "Supermarkets", icon: ShoppingCart },
                  { key: "food", label: "Meals", icon: Utensils },
                  { key: "point_of_interest", label: "Points", icon: MapPin },
                ]

                const getPlacesByCategory = (categoryKey: string) => {
                  return places?.filter(p => p.type.includes(categoryKey) || categoryKey === "point_of_interest" && (p.type.includes("point_of_interest") || p.type.includes("tourist"))) || []
                }

                return (
                  <div className="space-y-6">
                    <div className="border rounded-lg p-4 bg-muted/20">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="font-medium">Day {dayIndex + 1} Route</h3>
                          {routeInfo && (
                            <p className="text-sm text-muted-foreground">
                              {routeInfo.distanceText} • {routeInfo.durationText}
                            </p>
                          )}
                        </div>
                        <Badge variant="outline">{dayStops.length} stops</Badge>
                      </div>

                      {dayStops.length > 0 ? (
                        <div className="relative">
                          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-primary/30" />
                          <div className="space-y-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white text-xs font-bold z-10 shrink-0">
                                A
                              </div>
                              <div className="text-sm font-medium">{dayIndex === 0 ? trip.start_location_text : `Day ${dayIndex} End`}</div>
                            </div>
                            {dayStops.map((stop, stopIndex) => {
                              const globalIndex = dayIndex * stopsPerDay + stopIndex
                              return (
                              <div key={stop.id} className="flex items-center gap-3">
                                <div className="flex flex-col gap-0.5 shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    disabled={globalIndex === 0}
                                    onClick={() => {
                                      const newStops = [...stops]
                                      ;[newStops[globalIndex], newStops[globalIndex - 1]] = [newStops[globalIndex - 1], newStops[globalIndex]]
                                      setStops(newStops)
                                      setFilteredStops(newStops)
                                    }}
                                  >
                                    <ArrowUp className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    disabled={globalIndex === stops.length - 1}
                                    onClick={() => {
                                      const newStops = [...stops]
                                      ;[newStops[globalIndex], newStops[globalIndex + 1]] = [newStops[globalIndex + 1], newStops[globalIndex]]
                                      setStops(newStops)
                                      setFilteredStops(newStops)
                                    }}
                                  >
                                    <ArrowDown className="h-3 w-3" />
                                  </Button>
                                </div>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold z-10 cursor-pointer hover:scale-110 transition-transform shrink-0">
                                      {globalIndex + 1}
                                    </div>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-48">
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2">
                                        <p className="font-medium">{stop.location_name}</p>
                                        {stop.verification_status === "custom" ? (
                                          <Badge className="bg-orange-500 text-xs">Custom</Badge>
                                        ) : (
                                          <Badge className="bg-green-500 text-xs">Verified</Badge>
                                        )}
                                      </div>
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        className="w-full"
                                        onClick={() => handleDeleteStopClick(stop.id, stop.location_name)}
                                      >
                                        <Trash2 className="h-4 w-4 mr-1" />
                                        Delete Stop
                                      </Button>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                                <div className="text-sm flex-1 min-w-0">
                                  <div className="font-medium truncate">{stop.location_name}</div>
                                  <div className="text-xs text-muted-foreground truncate">{stop.state}</div>
                                </div>
                              </div>
                            )})}
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white text-xs font-bold z-10 shrink-0">
                                B
                              </div>
                              <div className="text-sm font-medium">{dayIndex === (trip.trip_duration_days || 1) - 1 ? trip.destination_text : `Day ${dayIndex + 2} Start`}</div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">No stops for this day</p>
                      )}
                    </div>

                    <div>
                      <h3 className="font-medium mb-3">Nearby Places - Add to Trip</h3>
                      {isLoading ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <RefreshCw className="h-6 w-6 mx-auto animate-spin mb-2" />
                          Loading nearby places...
                        </div>
                      ) : places && places.length > 0 ? (
                        <div className="space-y-4">
                          {placeCategories.map(({ key, label, icon: Icon }) => {
                            const categoryPlaces = getPlacesByCategory(key)
                            if (categoryPlaces.length === 0) return null
                            return (
                              <div key={key}>
                                <div className="flex items-center gap-2 mb-2">
                                  <Icon className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm font-medium">{label}</span>
                                  <Badge variant="outline" className="text-xs">{categoryPlaces.length}</Badge>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {categoryPlaces.slice(0, 4).map((place, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-center gap-2 text-sm bg-background p-2 rounded-lg border hover:border-primary/50 transition-colors"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <div className="font-medium truncate">{place.name}</div>
                                        <div className="text-xs text-muted-foreground truncate">
                                          {place.address}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1 shrink-0">
                                        {place.rating && (
                                          <Badge variant="outline" className="text-xs">
                                            ★ {place.rating}
                                          </Badge>
                                        )}
                                        {place.isOpenNow && (
                                          <Badge className="bg-green-500 text-xs">Open</Badge>
                                        )}
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={() => handleAddPlaceToDay(dayIndex, place)}
                                          title="Add to trip"
                                        >
                                          <Plus className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">No nearby places found</p>
                      )}
                    </div>
                  </div>
                )
              })()}
            </CardContent>
          </Card>
        )}

      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Delete Trip</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-6">
                Are you sure you want to delete this trip? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteTrip}
                  disabled={deleting}
                >
                  {deleting ? "Deleting..." : "Delete Trip"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <AlertDialog open={!!selectedStopForDelete} onOpenChange={(open) => !open && setSelectedStopForDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Stop</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete <strong>{selectedStopForDelete?.name}</strong>? This action cannot be undone.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteStop} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
