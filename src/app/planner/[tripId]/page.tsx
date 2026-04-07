"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { LoadScript, GoogleMap, Marker, DirectionsRenderer, type Libraries } from "@react-google-maps/api"
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import type { Stop } from "@/lib/types"
import { getStoredUser, hasAccess } from "@/lib/auth"
import {
  Route,
  MapPin,
  ArrowLeft,
  Edit,
  Plus,
  Save,
  Download,
  Trash2,
  ChevronDown,
  ChevronUp,
  Fuel,
  Caravan,
  Tent,
  Coffee,
  Wrench,
  Droplets,
  ShoppingCart,
  GripVertical,
  Sparkles,
  Loader2,
  MessageSquare,
  Send,
  RefreshCw,
  ChevronRight,
  History,
  RotateCcw,
  AlertTriangle,
  X,
} from "lucide-react"

const mapContainerStyle = {
  width: "100%",
  height: "100%",
}

const googleMapsLibraries: Libraries = ["places"]

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
  route_data_json?: Record<string, unknown> | null
}

interface TripStop extends Omit<Stop, "id"> {
  id: string
  stop_id?: string
  distance_to_route_km?: number
  distance_from_start_km?: number
  stop?: Stop
  stop_type?: string
  address?: string
  day_index?: number
  routeDistance?: number
}

interface FuelStation {
  id?: string
  name: string
  lat: number
  lng: number
  address: string
  isOpenNow?: boolean
  rating?: number
  distanceFromStartKm?: number
}

interface DrivingInfo {
  totalDistanceKm: number
  totalDurationMinutes: number
}

interface PaceConfig {
  kmPerDay: number
  hoursPerLeg: number
  minSpacing: number
  maxSpacing: number
}

interface RouteStopOption {
  id: string
  location_name: string
  latitude?: string
  longitude?: string
  state?: string
  region?: string
  route_type?: string
  stay_type?: string
  pet_friendly?: string
  water?: string
  cost_band?: string
  tier?: string
  is_verified?: boolean
  distance_from_start_km?: number
  aao_tip?: string
  why_stop_here?: string
  why_we_d_stay_again?: string
}

interface RouteSegment {
  startKm: number
  endKm: number
  verifiedStops: RouteStopOption[]
  otherStops: RouteStopOption[]
  fuelSuggestions?: FuelStation[]
  primaryFuelSuggestion?: FuelStation
  isRemote?: boolean
  fuelCritical?: boolean
  degradedMode?: boolean
  fuelDistanceIntoLegKm?: number
  gapFromLastFuelKm?: number
  gapToNextFuelKm?: number
  fuelWarning?: string
}

interface RouteMeta {
  corridor?: string
  drivingInfo?: DrivingInfo
  paceConfig?: PaceConfig
  segments?: RouteSegment[]
  fuelStations?: FuelStation[]
  planningMode?: "standard" | "degraded-valid"
}

interface DayNarrative {
  dayNumber: number
  narrative: string
  suggestedStay: {
    name: string
    stopType: string
    whyStopHere: string
    aaoTip: string
  } | null
  aaoTips: string[]
  gapNote: string | null
  fuelNote: string | null
}

interface TripNarrative {
  overview: string
  days: DayNarrative[]
  tripNotes: {
    fuelGuidance: string | null
    remoteWarnings: string | null
    roadConditions: string | null
  } | null
  generatedAt: string
}

function SortableRouteStopItem({
  stop,
}: {
  stop: RouteStopOption
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: stop.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-4">
      <button
        type="button"
        className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
        title="Drag to reorder"
      >
        <GripVertical className="h-5 w-5 text-primary" />
      </button>
      <div className="flex-1 rounded-2xl bg-background p-3 border border-muted/30">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{stop.location_name}</span>
          {stop.is_verified && <Badge variant="outline" className="text-xs">Verified</Badge>}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {stop.stay_type || stop.route_type || "Stop"} • {stop.distance_from_start_km ? `${Math.round(stop.distance_from_start_km)} km from start` : ""}
        </div>
      </div>
    </div>
  )
}

function StaticRouteStopItem({
  stop,
}: {
  stop: RouteStopOption
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/30">
        <MapPin className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex-1 rounded-2xl bg-background p-3 border border-muted/30">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{stop.location_name}</span>
          {stop.is_verified ? (
            <Badge variant="outline" className="text-xs">Verified</Badge>
          ) : (
            <Badge variant="outline" className="text-xs">Fixed</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {stop.stay_type || stop.route_type || "Stop"} • {stop.distance_from_start_km ? `${Math.round(stop.distance_from_start_km)} km from start` : ""}
        </div>
      </div>
    </div>
  )
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
    distanceFromStartKm?: number
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
  const [routeMeta, setRouteMeta] = useState<Partial<RouteMeta>>({})
  const [routeOptionsLoading, setRouteOptionsLoading] = useState(false)
  const [routeWarnings, setRouteWarnings] = useState<string[]>([])
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null)
  const [expandedSegments, setExpandedSegments] = useState<Set<number>>(new Set())
  const [selectedSegmentOptionIds, setSelectedSegmentOptionIds] = useState<Record<number, string>>({})
  const [selectedSegmentFuelIds, setSelectedSegmentFuelIds] = useState<Record<number, string>>({})
  const [expandedSegmentOptions, setExpandedSegmentOptions] = useState<Set<number>>(new Set())
  const [segmentRouteOrderIds, setSegmentRouteOrderIds] = useState<Record<number, string[]>>({})
  const [excludedOptionIds, setExcludedOptionIds] = useState<Set<string>>(new Set())
  const [avoidLongDays, setAvoidLongDays] = useState(true)
  const [preferVerifiedStops, setPreferVerifiedStops] = useState(true)
  const [includeFreeCamps, setIncludeFreeCamps] = useState(false)
  const [includeFuelPlanning, setIncludeFuelPlanning] = useState(true)
  const [preferredLegLengthKm, setPreferredLegLengthKm] = useState(220)
  const [showFuelOverlay, setShowFuelOverlay] = useState(false)
  const [showOvernightOverlay, setShowOvernightOverlay] = useState(false)
  const [showRemoteOverlay, setShowRemoteOverlay] = useState(false)
  const [editWarnings, setEditWarnings] = useState<string[]>([])
  const [showEditWarningBanner, setShowEditWarningBanner] = useState(false)
  const dragSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [tripNarrative, setTripNarrative] = useState<TripNarrative | null>(null)
  const [narrativeLoading, setNarrativeLoading] = useState(false)
  const [hiddenCustomStopsByDay, setHiddenCustomStopsByDay] = useState<Record<number, string[]>>({})
  const [itineraryVersions, setItineraryVersions] = useState<Array<{ id: string; version: number; status: string; model_name: string | null; created_at: string }>>([])
  const [itineraryVersionsLoaded, setItineraryVersionsLoaded] = useState(false)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [restoringVersion, setRestoringVersion] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<Array<{ id?: string; role: string; message_text: string; created_at?: string }>>([])
  const [chatInput, setChatInput] = useState("")
  const [chatLoading, setChatLoading] = useState(false)
  const [chatMessagesLoaded, setChatMessagesLoaded] = useState(false)
  const [refilterBanner, setRefilterBanner] = useState<{ preferenceHint: string | null } | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  const normalizeStopId = (id: string | null | undefined): string => (id || "").replace(/^custom-/, "")

  const getCustomStopDisplayKey = (stop: {
    id?: string
    stop_id?: string
    location_name: string
    latitude?: string | number
    longitude?: string | number
  }): string => {
    const normalizedId = normalizeStopId(stop.stop_id || stop.id)
    const lat = Number(stop.latitude)
    const lng = Number(stop.longitude)
    const coordKey = Number.isFinite(lat) && Number.isFinite(lng)
      ? `${lat.toFixed(5)}|${lng.toFixed(5)}`
      : `${String(stop.latitude)}|${String(stop.longitude)}`
    return normalizedId || `${stop.location_name.toLowerCase().trim()}|${coordKey}`
  }

  const hideCustomStopFromDay = (dayIndex: number, stop: TripStop) => {
    const key = getCustomStopDisplayKey(stop)
    setHiddenCustomStopsByDay((prev) => {
      const existing = prev[dayIndex] || []
      if (existing.includes(key)) return prev
      return {
        ...prev,
        [dayIndex]: [...existing, key],
      }
    })
    toast.success(`Removed ${stop.location_name} from Day ${dayIndex + 1} route`)
  }

  const stopRepeatSummary = useMemo(() => {
    const counts = new Map<string, number>()

    for (const stop of stops) {
      const normalizedId = normalizeStopId(stop.stop_id || stop.id)
      if (!normalizedId) continue
      counts.set(normalizedId, (counts.get(normalizedId) || 0) + 1)
    }

    const uniqueStops = counts.size
    const repeatInstances = Array.from(counts.values()).reduce((sum, count) => sum + Math.max(0, count - 1), 0)
    const repeatedStops = Array.from(counts.values()).filter((count) => count > 1).length

    return {
      totalStops: stops.length,
      uniqueStops,
      repeatInstances,
      repeatedStops,
    }
  }, [stops])

  const applyDraggedOrderToTripStops = (tripStops: TripStop[], orderedStopIds: string[]) => {
    if (orderedStopIds.length === 0) return tripStops

    const getStopKey = (stop: TripStop) => stop.stop_id || stop.id
    const draggedStopSet = new Set(orderedStopIds)
    const firstDraggedIndex = tripStops.findIndex((stop) => draggedStopSet.has(getStopKey(stop)))

    if (firstDraggedIndex < 0) return tripStops

    const draggedStops = tripStops.filter((stop) => draggedStopSet.has(getStopKey(stop)))
    if (draggedStops.length < 2) return tripStops

    const draggedById = new Map(draggedStops.map((stop) => [getStopKey(stop), stop]))
    const orderedDraggedStops = orderedStopIds
      .map((id) => draggedById.get(id))
      .filter((stop): stop is TripStop => !!stop)

    const remainingStops = tripStops.filter((stop) => !draggedStopSet.has(getStopKey(stop)))
    const reorderedStops = [...remainingStops]
    reorderedStops.splice(firstDraggedIndex, 0, ...orderedDraggedStops)
    return reorderedStops
  }

  const getOrderedRouteStops = (segmentIndex: number, stopsForSegment: RouteStopOption[]) => {
    const orderedIds = segmentRouteOrderIds[segmentIndex]
    if (!orderedIds || orderedIds.length === 0) {
      const persistedOrder = new Map(
        stops.map((stop, idx) => [stop.stop_id || stop.id, idx])
      )

      return [...stopsForSegment].sort((a, b) => {
        const aIdx = persistedOrder.get(a.id)
        const bIdx = persistedOrder.get(b.id)
        const aRank = aIdx === undefined ? Number.MAX_SAFE_INTEGER : aIdx
        const bRank = bIdx === undefined ? Number.MAX_SAFE_INTEGER : bIdx

        if (aRank !== bRank) return aRank - bRank

        const aDistance = a.distance_from_start_km ?? Number.MAX_SAFE_INTEGER
        const bDistance = b.distance_from_start_km ?? Number.MAX_SAFE_INTEGER
        return aDistance - bDistance
      })
    }

    const byId = new Map(stopsForSegment.map((stop) => [stop.id, stop]))
    const ordered = orderedIds
      .map((id) => byId.get(id))
      .filter((stop): stop is RouteStopOption => !!stop)

    const missing = stopsForSegment.filter((stop) => !orderedIds.includes(stop.id))
    return [...ordered, ...missing]
  }

  const handleRouteStopDragEnd = async (
    segmentIndex: number,
    visibleStops: RouteStopOption[],
    event: DragEndEvent
  ) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const currentIds = visibleStops.map((stop) => stop.id)
    const oldIndex = currentIds.indexOf(String(active.id))
    const newIndex = currentIds.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return

    const nextIds = arrayMove(currentIds, oldIndex, newIndex)
    console.log("hello drag reorder start", {
      tripId,
      segmentIndex,
      currentIds,
      nextIds,
    })

    setSegmentRouteOrderIds((prev) => ({
      ...prev,
      [segmentIndex]: nextIds,
    }))

    setStops((prev) => applyDraggedOrderToTripStops(prev, nextIds))
    setFilteredStops((prev) => applyDraggedOrderToTripStops(prev, nextIds))

    try {
      const rankStart = 1
      const rankStep = 0.0333
      const stopOrders = nextIds.map((id, idx) => ({
        id,
        rank_score: rankStart - (idx * rankStep),
      }))

      const response = await fetch(`/api/trips/${tripId}/stops`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stop_orders: stopOrders }),
      })

      const result = await response.json()
      console.log("hello drag reorder result", {
        ok: response.ok,
        status: response.status,
        result,
      })
      if (!result.success) {
        toast.error("Failed to persist stop order")
      }
    } catch (error) {
      console.error("Error persisting route stop order:", error)
      toast.error("Error saving stop order")
    }
  }

  const normalizeSegmentsToDays = (segments: RouteSegment[], targetDays: number): RouteSegment[] => {
    if (targetDays <= 0) return segments
    if (segments.length === targetDays) return segments

    if (segments.length < targetDays) {
      const padded = [...segments]
      while (padded.length < targetDays) {
        const last = padded[padded.length - 1]
        padded.push({
          startKm: last?.endKm ?? 0,
          endKm: last?.endKm ?? 0,
          verifiedStops: [],
          otherStops: [],
          fuelSuggestions: [],
          primaryFuelSuggestion: undefined,
          isRemote: false,
          fuelCritical: false,
          degradedMode: false,
          fuelDistanceIntoLegKm: undefined,
          gapFromLastFuelKm: undefined,
          gapToNextFuelKm: undefined,
          fuelWarning: undefined,
        })
      }
      return padded
    }

    const buckets: RouteSegment[][] = Array.from({ length: targetDays }, () => [])
    segments.forEach((segment, index) => {
      const bucket = Math.min(targetDays - 1, Math.floor((index * targetDays) / segments.length))
      buckets[bucket].push(segment)
    })

    return buckets.map((group) => {
      if (group.length === 0) {
        return {
          startKm: 0,
          endKm: 0,
          verifiedStops: [],
          otherStops: [],
          fuelSuggestions: [],
          primaryFuelSuggestion: undefined,
          isRemote: false,
          fuelCritical: false,
          degradedMode: false,
          fuelDistanceIntoLegKm: undefined,
          gapFromLastFuelKm: undefined,
          gapToNextFuelKm: undefined,
          fuelWarning: undefined,
        }
      }

      const first = group[0]
      const last = group[group.length - 1]

      const verifiedStopsMap = new Map<string, RouteStopOption>()
      const otherStopsMap = new Map<string, RouteStopOption>()
      const fuelMap = new Map<string, FuelStation>()

      group.forEach((seg) => {
        seg.verifiedStops.forEach((s) => verifiedStopsMap.set(s.id, s))
        seg.otherStops.forEach((s) => otherStopsMap.set(s.id, s))
          ; (seg.fuelSuggestions || []).forEach((f) => fuelMap.set(`${f.name}-${f.lat}-${f.lng}`, f))
      })

      const fuelSuggestions = Array.from(fuelMap.values()).slice(0, 3)

      return {
        startKm: first.startKm,
        endKm: last.endKm,
        verifiedStops: Array.from(verifiedStopsMap.values()),
        otherStops: Array.from(otherStopsMap.values()),
        fuelSuggestions,
        primaryFuelSuggestion: fuelSuggestions[0],
        isRemote: group.some((s) => s.isRemote),
        fuelCritical: group.some((s) => s.fuelCritical),
        degradedMode: group.some((s) => s.degradedMode),
        fuelDistanceIntoLegKm: group.find((s) => s.fuelDistanceIntoLegKm !== undefined)?.fuelDistanceIntoLegKm,
        gapFromLastFuelKm: group.find((s) => s.gapFromLastFuelKm !== undefined)?.gapFromLastFuelKm,
        gapToNextFuelKm: group.find((s) => s.gapToNextFuelKm !== undefined)?.gapToNextFuelKm,
        fuelWarning: group.find((s) => s.fuelWarning)?.fuelWarning,
      }
    })
  }

  const targetDays = Math.max(
    1,
    routeMeta.drivingInfo?.totalDistanceKm
      ? Math.min(
        Number(trip?.trip_duration_days || Number.MAX_SAFE_INTEGER),
        Math.round(
          routeMeta.drivingInfo.totalDistanceKm /
          (routeMeta.paceConfig?.kmPerDay || 200)
        )
      )
      : Number(trip?.trip_duration_days || 1)
  )

  const showPlanningSkeleton =
    routeOptionsLoading &&
    (!routeMeta.segments || routeMeta.segments.length === 0)

  const allDaySegments = useMemo(
    () =>
      routeMeta.segments && routeMeta.segments.length > 0
        ? normalizeSegmentsToDays(routeMeta.segments, targetDays)
        : Array.from({ length: targetDays }, (_, index) => ({
            startKm: Math.round((routeMeta.drivingInfo?.totalDistanceKm || 0) * (index / targetDays)),
            endKm: Math.round((routeMeta.drivingInfo?.totalDistanceKm || 0) * ((index + 1) / targetDays)),
            verifiedStops: [],
            otherStops: [],
            fuelSuggestions: [],
            primaryFuelSuggestion: undefined,
            isRemote: false,
            fuelCritical: false,
            degradedMode: false,
            fuelDistanceIntoLegKm: undefined,
            gapFromLastFuelKm: undefined,
            gapToNextFuelKm: undefined,
            fuelWarning: undefined,
          })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routeMeta.segments, routeMeta.drivingInfo?.totalDistanceKm, routeMeta.paceConfig?.kmPerDay, targetDays]
  )

  const plannedDays = allDaySegments.length
  const effectiveDayCount = Math.max(1, plannedDays)
  const daySegments = useMemo(
    () => allDaySegments.slice(0, effectiveDayCount),
    [allDaySegments, effectiveDayCount]
  )

  const totalRouteDistanceKm = routeMeta.drivingInfo?.totalDistanceKm || 0
  const totalRouteDurationMinutes = routeMeta.drivingInfo?.totalDurationMinutes || 0
  const plannedDistanceKm = daySegments.length > 0 ? daySegments[daySegments.length - 1].endKm : 0
  const remainingDistanceKm = Math.max(0, totalRouteDistanceKm - plannedDistanceKm)
  const remainingDurationMinutes = totalRouteDistanceKm > 0
    ? Math.round((remainingDistanceKm / totalRouteDistanceKm) * totalRouteDurationMinutes)
    : 0

  const loadNearbyPlacesForDay = async (dayIndex: number, segment?: RouteSegment) => {
    if (nearbyPlaces[dayIndex] || loadingPlaces.has(dayIndex)) return

    setLoadingPlaces((prev) => new Set(prev).add(dayIndex))

    const segmentStops = segment ? [...segment.verifiedStops, ...segment.otherStops] : []
    const midStop = segmentStops.length > 0
      ? segmentStops[Math.floor(segmentStops.length / 2)]
      : null

    const stopLat = midStop ? parseFloat(midStop.latitude ?? "0") : NaN
    const stopLng = midStop ? parseFloat(midStop.longitude ?? "0") : NaN

    const totalKm = routeMeta.drivingInfo?.totalDistanceKm || 0
    const segmentMidKm = segment ? (segment.startKm + segment.endKm) / 2 : 0
    const segmentProgress = totalKm > 0 ? Math.max(0, Math.min(1, segmentMidKm / totalKm)) : 0

    const interpLat = trip?.start_lat !== null && trip?.start_lat !== undefined && trip?.destination_lat !== null && trip?.destination_lat !== undefined
      ? trip.start_lat + ((trip.destination_lat - trip.start_lat) * segmentProgress)
      : NaN
    const interpLng = trip?.start_lng !== null && trip?.start_lng !== undefined && trip?.destination_lng !== null && trip?.destination_lng !== undefined
      ? trip.start_lng + ((trip.destination_lng - trip.start_lng) * segmentProgress)
      : NaN

    const canUseStop = isValidLatLng(stopLat, stopLng)
    const canUseInterp = isValidLatLng(interpLat, interpLng)

    let midLat = canUseInterp ? interpLat : (trip?.start_lat || -25.2744)
    let midLng = canUseInterp ? interpLng : (trip?.start_lng || 133.7751)

    if (canUseStop) {
      if (canUseInterp) {
        const driftKm = haversineKm(stopLat, stopLng, interpLat, interpLng)
        if (driftKm <= 600) {
          midLat = stopLat
          midLng = stopLng
        }
      } else {
        midLat = stopLat
        midLng = stopLng
      }
    }

    if (isValidLatLng(midLat, midLng)) {
      try {
        const response = await fetch(
          `/api/places/nearby?lat=${midLat}&lng=${midLng}&radius=35000&types=campground,rv_park,gas_station`
        )
        const data = await response.json()

        if (data.success && data.places) {
          const allowedTypes = new Set(["campground", "rv_park", "gas_station"])
          const cleanedPlaces = data.places.filter((place: { type?: string }) =>
            !!place.type && allowedTypes.has(place.type)
          )

          setNearbyPlaces((prev) => ({
            ...prev,
            [dayIndex]: cleanedPlaces,
          }))
        }
      } catch (error) {
        console.error("Error fetching nearby places:", error)
      }
    }

    setLoadingPlaces((prev) => {
      const next = new Set(prev)
      next.delete(dayIndex)
      return next
    })
  }

  const toggleDayExpansion = async (dayIndex: number) => {
    setActiveDayTab(dayIndex)
    setExpandedSegments(prev => {
      const next = new Set(prev)
      if (next.has(dayIndex)) next.delete(dayIndex)
      else next.add(dayIndex)
      return next
    })

    await loadNearbyPlacesForDay(dayIndex, daySegments[dayIndex])
  }

  const handleDeleteStopClick = (stopId: string, stopName: string) => {
    setSelectedStopForDelete({ id: stopId, name: stopName })
  }

  const confirmDeleteStop = async () => {
    if (!selectedStopForDelete) return

    try {
      const stopToDelete = stops.find(s => s.id === selectedStopForDelete.id)
      const isCustomStop = stopToDelete?.verification_status === "custom"

      const tryDeleteTripStop = async () => {
        const response = await fetch(`/api/trips/${tripId}/stops?id=${selectedStopForDelete.id}`, {
          method: "DELETE",
        })
        return response.json()
      }

      const tryDeleteCustomStop = async () => {
        const response = await fetch(`/api/custom-stops?id=${selectedStopForDelete.id}`, {
          method: "DELETE",
        })
        return response.json()
      }

      let result: { success: boolean; error?: string }
      if (isCustomStop) {
        result = await tryDeleteCustomStop()
        if (!result.success) {
          const fallback = await tryDeleteTripStop()
          if (fallback.success) {
            result = fallback
          }
        }
      } else {
        result = await tryDeleteTripStop()
        if (!result.success) {
          const fallback = await tryDeleteCustomStop()
          if (fallback.success) {
            result = fallback
          }
        }
      }

      if (!result.success) {
        console.error("Failed to remove stop:", result.error)
        toast.error(result.error || "Failed to remove stop")
        return
      }

      validateFuelAfterEdit(selectedStopForDelete.id, selectedStopForDelete.name)

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
        setFuelStations(data.fuelStations.map((s: { name: string; lat: number; lng: number; address: string; isOpenNow?: boolean; rating?: number; distanceFromStartKm?: number }, i: number) => ({
          id: `fuel-${i}`,
          name: s.name,
          lat: s.lat,
          lng: s.lng,
          address: s.address,
          isOpenNow: s.isOpenNow,
          rating: s.rating,
          distanceFromStartKm: s.distanceFromStartKm,
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

  const normalizeRouteOption = (option: RouteStopOption) => ({
    id: option.id,
    location_name: option.location_name,
    latitude: option.latitude ?? "0",
    longitude: option.longitude ?? "0",
    state: option.state ?? "",
    region: option.region ?? "",
    route_type: option.route_type ?? "",
    stay_type: option.stay_type ?? "",
    pet_friendly: option.pet_friendly ?? "",
    water: option.water ?? "",
    cost_band: option.cost_band ?? "",
    tier: option.tier ?? "",
  })

  const handleAddSegmentStop = async (segment: RouteSegment, segmentIndex: number) => {
    const selected = getSelectedOption(segment, segmentIndex) || getSegmentOptions(segment, 1)[0]
    if (!selected) {
      toast.error("No stop option available to add.")
      return
    }
    await handleChooseSegmentOption(segment, segmentIndex, selected)
  }

  const handleChooseSegmentOption = async (segment: RouteSegment, segmentIndex: number, option: RouteStopOption) => {
    const currentSelected = getSelectedOption(segment, segmentIndex)
    if (currentSelected && currentSelected.id !== option.id && stops.some((stop) => stop.id === currentSelected.id)) {
      await handleRemoveStopFromOptions(currentSelected.id)
    }

    setSelectedSegmentOptionIds((prev) => ({
      ...prev,
      [segmentIndex]: option.id,
    }))

    setExcludedOptionIds((prev) => {
      if (!prev.has(option.id)) return prev
      const next = new Set(prev)
      next.delete(option.id)
      return next
    })

    await handleAddStopFromOptions(normalizeRouteOption(option))
    await loadRouteOptions()
    toast.success(`${option.location_name} selected for this stop.`)
  }

  const handleChangeStopForSegment = async (segment: RouteSegment, segmentIndex: number) => {
    const selected = getSelectedOption(segment, segmentIndex)
    const options = [...segment.verifiedStops, ...segment.otherStops]
    const alternate = options.find(
      (option) =>
        option.id !== selected?.id &&
        !excludedOptionIds.has(option.id) &&
        !stops.some((stop) => stop.id === option.id)
    )

    if (!alternate) {
      toast.error("No alternate stop available to apply for this day.")
      return
    }

    if (selected && stops.some((stop) => stop.id === selected.id)) {
      await handleRemoveStopFromOptions(selected.id)
    }

    await handleChooseSegmentOption(segment, segmentIndex, alternate)
  }

  const handleSwapSegmentOption = async (segment: RouteSegment, segmentIndex: number) => {
    const selected = getSelectedOption(segment, segmentIndex)
    const allOptions = [...segment.verifiedStops, ...segment.otherStops].filter(
      (option) => !excludedOptionIds.has(option.id)
    )

    if (allOptions.length < 2) {
      toast.error("No alternate option available to swap.")
      return
    }

    const currentIndex = selected
      ? allOptions.findIndex((option) => option.id === selected.id)
      : -1
    const nextIndex = currentIndex >= 0
      ? (currentIndex + 1) % allOptions.length
      : 0
    const nextOption = allOptions[nextIndex]

    setSelectedSegmentOptionIds((prev) => ({
      ...prev,
      [segmentIndex]: nextOption.id,
    }))
    toast.success(`Swapped preview to ${nextOption.location_name}. Use Change stop to apply.`)
  }

  const handleSkipSegmentStop = async (segment: RouteSegment, segmentIndex: number) => {
    const selected = getSelectedOption(segment, segmentIndex)
    if (!selected) {
      toast.error("No stop selected for this segment to skip.")
      return
    }

    if (stops.some((stop) => stop.id === selected.id)) {
      await handleRemoveStopFromOptions(selected.id)
    }

    setExcludedOptionIds((prev) => new Set(prev).add(selected.id))
    setSelectedSegmentOptionIds((prev) => {
      const next = { ...prev }
      delete next[segmentIndex]
      return next
    })
    toast.success("Skipped this stop option for the day")
  }

  const handleRebuildSegment = async (segment: RouteSegment, segmentIndex: number) => {
    setRouteOptionsLoading(true)
    try {
      const segmentOptionIds = new Set(
        [...segment.verifiedStops, ...segment.otherStops].map((option) => option.id)
      )

      setExcludedOptionIds((prev) => {
        const next = new Set(prev)
        segmentOptionIds.forEach((id) => next.delete(id))
        return next
      })

      setSelectedSegmentOptionIds((prev) => {
        const next = { ...prev }
        delete next[segmentIndex]
        return next
      })

      await loadRouteOptions()
      toast.success(`Day ${segmentIndex + 1} options refreshed`)
    } catch (error) {
      console.error("Error rebuilding segment:", error)
      toast.error("Failed to refresh this leg")
    } finally {
      setRouteOptionsLoading(false)
    }
  }

  const toggleSegmentOptions = (segmentIndex: number) => {
    setExpandedSegmentOptions((prev) => {
      const next = new Set(prev)
      if (next.has(segmentIndex)) {
        next.delete(segmentIndex)
      } else {
        next.add(segmentIndex)
      }
      return next
    })
  }

  const handleRemoveSegmentSelection = async (segment: RouteSegment, segmentIndex: number) => {
    const selected = getSelectedOption(segment, segmentIndex)
    if (!selected) {
      toast.error("No selected stop to remove for this segment.")
      return
    }

    if (stops.some((stop) => stop.id === selected.id)) {
      await handleRemoveStopFromOptions(selected.id)
    }

    setExcludedOptionIds((prev) => new Set(prev).add(selected.id))
    await loadRouteOptions()
    setSelectedSegmentOptionIds((prev) => {
      const next = { ...prev }
      delete next[segmentIndex]
      return next
    })
    toast.success("Removed selected stop from this segment")
  }

  const toggleSegmentExpanded = (index: number) => {
    setExpandedSegments((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const handleRebuildPlan = async () => {
    setTripNarrative(null)
    setRouteOptionsLoading(true)
    try {
      await loadRouteOptions()
      const sorted = await sortStopsAlongRoute(stops)
      setStops(sorted)
      setFilteredStops(sorted)
      setSelectedSegmentOptionIds({})
      setExpandedSegmentOptions(new Set())
      toast.success("Plan rebuilt")
    } catch (error) {
      console.error("Error rebuilding plan:", error)
      toast.error("Failed to rebuild plan")
    } finally {
      setRouteOptionsLoading(false)
    }
  }

  const [fixingPlan, setFixingPlan] = useState(false)

  const handleFixPlan = async () => {
    if (!trip || !userId) return
    setFixingPlan(true)
    try {
      const days = daySegments.map((segment, index) => {
        const selected = getSelectedOption(segment, index)
        const prev = index > 0 ? getSelectedOption(daySegments[index - 1], index - 1) : null
        return {
          day: index + 1,
          startName: index === 0 ? (trip.start_location_text ?? "Start") : (prev?.location_name ?? `Day ${index}`),
          endName: selected?.location_name ?? "",
          endLat: typeof selected?.latitude === "number" ? selected.latitude : parseFloat(selected?.latitude ?? "0"),
          endLng: typeof selected?.longitude === "number" ? selected.longitude : parseFloat(selected?.longitude ?? "0"),
          endDistanceFromStartKm: selected?.distance_from_start_km ?? segment.endKm,
          driveKm: Math.round(segment.endKm - segment.startKm),
        }
      })

      const candidateMap = new Map<string, { name: string; latitude: number; longitude: number; distance_from_start_km: number; stay_type?: string }>()
      for (const seg of daySegments) {
        for (const stop of [...seg.verifiedStops, ...seg.otherStops]) {
          if (!candidateMap.has(stop.id)) {
            candidateMap.set(stop.id, {
              name: stop.location_name,
              latitude: typeof stop.latitude === "number" ? stop.latitude : parseFloat(stop.latitude ?? "0"),
              longitude: typeof stop.longitude === "number" ? stop.longitude : parseFloat(stop.longitude ?? "0"),
              distance_from_start_km: stop.distance_from_start_km ?? 0,
              stay_type: stop.stay_type,
            })
          }
        }
      }

      const response = await fetch(`/api/trips/${tripId}/fix-itinerary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days,
          candidates: Array.from(candidateMap.values()).sort((a, b) => a.distance_from_start_km - b.distance_from_start_km),
          tripStartName: trip.start_location_text ?? "Start",
          totalDistanceKm: routeMeta.drivingInfo?.totalDistanceKm ?? 0,
        }),
      })

      const data = await response.json()
      if (!data.success) {
        toast.error(data.error ?? "Failed to fix plan")
        return
      }

      const newIds: Record<number, string> = {}
      for (const fixedDay of data.days as Array<{ day: number; endName: string }>) {
        const segIndex = fixedDay.day - 1
        const seg = daySegments[segIndex]
        if (!seg) continue
        const allOpts = [...seg.verifiedStops, ...seg.otherStops]
        const match = allOpts.find((s) => s.location_name === fixedDay.endName)
        if (match) newIds[segIndex] = match.id
      }

      setSelectedSegmentOptionIds(newIds)
      toast.success("Itinerary fixed — duplicates removed and flow corrected")
    } catch (err) {
      console.error("Fix plan error:", err)
      toast.error("Failed to fix plan")
    } finally {
      setFixingPlan(false)
    }
  }


  const handleGenerateNarrative = async () => {
    if (!trip || !userId) return
    setNarrativeLoading(true)
    try {
      const daysPayload = daySegments.map((segment, index) => {
        const verifiedStops = segment.verifiedStops.map((s) => ({
          location_name: s.location_name,
          stay_type: s.stay_type ?? null,
          route_type: s.route_type ?? null,
          aao_tip: s.aao_tip ?? null,
          why_stop_here: s.why_stop_here ?? null,
          why_we_d_stay_again: s.why_we_d_stay_again ?? null,
        }))

        const optionStops = [...segment.verifiedStops, ...segment.otherStops].map((s) => ({
          location_name: s.location_name,
          stay_type: s.stay_type ?? null,
          route_type: s.route_type ?? null,
          aao_tip: s.aao_tip ?? null,
          why_stop_here: s.why_stop_here ?? null,
          why_we_d_stay_again: s.why_we_d_stay_again ?? null,
          is_verified: Boolean(s.is_verified),
        }))

        const allowedStopNames = Array.from(new Set(optionStops.map((s) => s.location_name).filter(Boolean)))

        return {
          dayNumber: index + 1,
          fromLocation: index === 0
            ? trip.start_location_text
            : (getSelectedOption(daySegments[index - 1], index - 1)?.location_name ?? null),
          toLocation: index === daySegments.length - 1
            ? trip.destination_text
            : (getSelectedOption(segment, index)?.location_name ?? null),
          distanceKm: estimateSegmentDistance(segment),
          driveTimeMinutes: estimateSegmentDuration(segment),
          verifiedStops,
          optionStops,
          // Explicit list for AI enforcement — AI must only pick from these names
          allowedStopNames,
          // Fuel data
          fuelCritical: segment.fuelCritical ?? false,
          isRemote: segment.isRemote ?? false,
          fuelWarning: segment.fuelWarning ?? null,
          primaryFuelStop: segment.primaryFuelSuggestion
            ? { name: segment.primaryFuelSuggestion.name, distanceFromStartKm: segment.primaryFuelSuggestion.distanceFromStartKm ?? null }
            : null,
          gapFromLastFuelKm: segment.gapFromLastFuelKm ?? null,
          gapToNextFuelKm: segment.gapToNextFuelKm ?? null,
          degradedMode: segment.degradedMode ?? false,
        }
      })

      // Top-level fuel summary across all segments
      const fuelSummary = {
        totalFuelStations: routeMeta.fuelStations?.length ?? 0,
        fuelCriticalDays: daySegments.filter((s) => s.fuelCritical).length,
        remoteDays: daySegments.filter((s) => s.isRemote).length,
        planningMode: routeMeta.planningMode ?? "standard",
      }

      const response = await fetch(`/api/trips/${tripId}/narrative`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          trip: { title: trip.title, travel_pace: trip.travel_pace, trip_duration_days: trip.trip_duration_days },
          corridor: routeMeta.corridor,
          totalDistanceKm: routeMeta.drivingInfo?.totalDistanceKm,
          fuelSummary,
          days: daysPayload,
        }),
      })
      const result = await response.json()
      if (result.success) {
        setTripNarrative(result.narrative)
        toast.success("AI narrative generated and saved")
        // Refresh version history after new generation
        if (userId) {
          fetch(`/api/trips/${tripId}/itineraries?user_id=${userId}`)
            .then((r) => r.json())
            .then((d) => { if (d.success) { setItineraryVersions(d.itineraries); setItineraryVersionsLoaded(true) } })
            .catch(() => {})
        }
      } else {
        toast.error(result.error ?? "Failed to generate narrative")
      }
    } catch (error) {
      console.error("Error generating narrative:", error)
      toast.error("Error generating narrative")
    } finally {
      setNarrativeLoading(false)
    }
  }

  const loadItineraryVersions = async () => {
    if (!userId || itineraryVersionsLoaded) return
    try {
      const response = await fetch(`/api/trips/${tripId}/itineraries?user_id=${userId}`)
      const data = await response.json()
      if (data.success) {
        setItineraryVersions(data.itineraries)
        setItineraryVersionsLoaded(true)
      }
    } catch (error) {
      console.error("Error loading itinerary versions:", error)
    }
  }

  const handleRestoreVersion = async (itineraryId: string) => {
    if (!userId || restoringVersion) return
    setRestoringVersion(itineraryId)
    try {
      const response = await fetch(`/api/trips/${tripId}/itineraries`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, itineraryId }),
      })
      const result = await response.json()
      if (result.success) {
        setTripNarrative(result.narrative as TripNarrative)
        setItineraryVersions((prev) =>
          prev.map((v) => ({ ...v, status: v.id === itineraryId ? "active" : "superseded" }))
        )
        setShowVersionHistory(false)
        toast.success("Narrative version restored")
      } else {
        toast.error(result.error ?? "Failed to restore version")
      }
    } catch (error) {
      console.error("Error restoring version:", error)
      toast.error("Error restoring version")
    } finally {
      setRestoringVersion(null)
    }
  }

  const loadChatMessages = async () => {
    if (!userId || chatMessagesLoaded) return
    try {
      const response = await fetch(`/api/trips/${tripId}/messages?user_id=${userId}`)
      const data = await response.json()
      if (data.success) {
        setChatMessages(data.messages)
        setChatMessagesLoaded(true)
      }
    } catch (error) {
      console.error("Error loading chat messages:", error)
    }
  }

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !userId || chatLoading) return
    const text = chatInput.trim()
    setChatInput("")
    setChatMessages((prev) => [...prev, { role: "user", message_text: text }])
    setChatLoading(true)
    try {
      const response = await fetch(`/api/trips/${tripId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          message_text: text,
          tripContext: tripNarrative
            ? { overview: tripNarrative.overview, corridor: routeMeta.corridor, days: tripNarrative.days.length }
            : { title: trip?.title, corridor: routeMeta.corridor },
        }),
      })
      const result = await response.json()
      if (result.success && result.message) {
        setChatMessages((prev) => [...prev, result.message])
        if (result.action?.type === "refilter") {
          setRefilterBanner({ preferenceHint: result.action.preferenceHint ?? null })
          // Auto-refilter stops so the updated preferences take effect immediately (§7.7)
          loadRouteOptions()
        }
      }
    } catch (error) {
      console.error("Error sending message:", error)
      toast.error("Failed to send message")
    } finally {
      setChatLoading(false)
    }
  }

  const handleSaveTrip = async () => {
    setSaving(true)
    try {
      // Persist segment selections alongside the narrative so they survive page reload (§7.9)
      const currentRouteDataJson = (trip?.route_data_json ?? {}) as Record<string, unknown>
      const response = await fetch(`/api/trips/${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "saved",
          userId,
          route_data_json: {
            ...currentRouteDataJson,
            selectedSegmentOptionIds,
            selectedSegmentFuelIds,
            narrative: tripNarrative ?? currentRouteDataJson.narrative,
          },
        }),
      })
      const result = await response.json()

      if (result.success) {
        setTrip((prev) => prev ? { ...prev, status: "saved" } : null)
        toast.success("Trip saved")
      } else {
        console.error("Failed to save trip:", result.error)
        toast.error("Failed to save trip")
      }
    } catch (error) {
      console.error("Error saving trip:", error)
      toast.error("Error saving trip")
    } finally {
      setSaving(false)
    }
  }

  const handleExportPdf = async () => {
    try {
      const response = await fetch(
        `/api/trips/${tripId}/export?format=pdf${userId ? `&user_id=${userId}` : ""}`
      )

      if (!response.ok) {
        toast.error("Failed to export PDF")
        return
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      const disposition = response.headers.get("Content-Disposition") ?? ""
      const match = disposition.match(/filename="([^"]+)"/)
      a.href = url
      a.download = match ? match[1] : "trip.pdf"
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Error exporting trip:", error)
      toast.error("Error exporting PDF")
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
        await loadRouteOptions()
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
      const normalizedStopId = normalizeStopId(stopId)
      const stopToRemove = stops.find((s) => normalizeStopId(s.id) === normalizedStopId)
      const stopName = stopToRemove?.location_name || "Unknown stop"
      const isCustomStop = stopToRemove?.verification_status === "custom" || stopId.startsWith("custom-")

      const tryDeleteTripStop = async () => {
        const response = await fetch(`/api/trips/${tripId}/stops?id=${normalizedStopId}`, {
          method: "DELETE",
        })
        return response.json()
      }

      const tryDeleteCustomStop = async () => {
        const response = await fetch(`/api/custom-stops?id=${stopId}`, {
          method: "DELETE",
        })
        return response.json()
      }

      const result = isCustomStop
        ? (await tryDeleteCustomStop())
        : (await tryDeleteTripStop())

      if (result.success) {
        validateFuelAfterEdit(stopId, stopName)
        const newStops = stops.filter((s) => normalizeStopId(s.id) !== normalizedStopId)
        setStops(newStops)
        setFilteredStops(newStops)
        await loadRouteOptions()
        toast.success("Stop removed from trip")
      } else {
        toast.error(result.error || "Failed to remove stop")
      }
    } catch (error) {
        toast.error("Error removing stop")
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
    try {
      const stored = localStorage.getItem(`trip:${tripId}:excluded-options`)
      if (!stored) {
        setExcludedOptionIds(new Set())
        return
      }

      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        setExcludedOptionIds(new Set(parsed))
      } else {
        setExcludedOptionIds(new Set())
      }
    } catch {
      setExcludedOptionIds(new Set())
    }
  }, [tripId])

  useEffect(() => {
    localStorage.setItem(
      `trip:${tripId}:excluded-options`,
      JSON.stringify(Array.from(excludedOptionIds))
    )
  }, [excludedOptionIds, tripId])

  const capitalize = (value: string | undefined) => {
    if (!value) return ""
    return value.charAt(0).toUpperCase() + value.slice(1)
  }

  const formatDistance = (distanceKm: number) => `${Math.round(distanceKm)} km`

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = Math.round(minutes % 60)
    return `${hours}h ${mins}m`
  }

  const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const toRad = (deg: number) => (deg * Math.PI) / 180
    const earthRadiusKm = 6371
    const dLat = toRad(lat2 - lat1)
    const dLng = toRad(lng2 - lng1)
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return earthRadiusKm * c
  }

  const isValidLatLng = (lat: number, lng: number) =>
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)

  const computeEstimatedDays = () => {
    return Math.max(1, daySegments.length)
  }

  const getRouteDescription = () => {
    if (!routeMeta.corridor) {
      return "Follows the main route corridor with planning focused on balanced driving days, overnight choices, and fuel conditions."
    }

    const corridor = routeMeta.corridor.toLowerCase()
    if (corridor.includes("bruce")) {
      return "Follows Bruce Highway north through coastal Queensland and then heads into remote northern corridors. Fuel and stop options become more limited beyond Laura."
    }

    if (corridor.includes("outback")) {
      return "Follows remote inland corridors with sparse services. Fuel and overnight options are limited; plan carefully for longer gaps."
    }

    return "Follows the primary corridor with pacing, overnight options, and fuel planning included."
  }

  const getSegmentDayType = (distanceKm: number) => {
    if (distanceKm < 180) return "Easy"
    if (distanceKm < 260) return "Moderate"
    if (distanceKm < 340) return "Long"
    return "Remote"
  }

  const estimateSegmentDistance = (segment: RouteSegment) => {
    return Math.max(0, segment.endKm - segment.startKm)
  }

  const estimateSegmentDuration = (segment: RouteSegment) => {
    const dist = estimateSegmentDistance(segment)

    if (routeMeta.drivingInfo?.totalDistanceKm && routeMeta.drivingInfo?.totalDurationMinutes) {
      return Math.round((dist / routeMeta.drivingInfo.totalDistanceKm) * routeMeta.drivingInfo.totalDurationMinutes)
    }

    // Fallback when API duration is unavailable.
    const speedByPace: Record<string, number> = {
      leisure: 70,
      moderate: 80,
      brisk: 90,
    }
    const avgSpeedKmh = speedByPace[trip?.travel_pace || "moderate"] || 80
    return Math.max(0, Math.round((dist / avgSpeedKmh) * 60))
  }

  const getSegmentLabel = (segment: RouteSegment, index: number) => {
    const allStops = [...segment.verifiedStops, ...segment.otherStops]
    const firstStop = allStops[0]?.location_name
    const lastStop = allStops[allStops.length - 1]?.location_name
    if (firstStop && lastStop) {
      return `${firstStop} → ${lastStop}`
    }
    if (firstStop) {
      return `${index === 0 ? trip?.start_location_text ?? "Start" : `Day ${index} start`} → ${firstStop}`
    }
    if (lastStop) {
      return `${lastStop} → ${index === daySegments.length - 1 ? trip?.destination_text ?? "Destination" : `Day ${index + 2} start`}`
    }
    return `${trip?.start_location_text ?? "Start"} → ${trip?.destination_text ?? "Destination"}`
  }

  const filterStopsBySegmentDistance = useCallback((segment: RouteSegment, options: RouteStopOption[]) => {
    if (options.length === 0) return options

    const optionsWithDistance = options.filter((option) =>
      typeof option.distance_from_start_km === "number" && Number.isFinite(option.distance_from_start_km)
    )

    if (optionsWithDistance.length === 0) return options

    const midpoint = (segment.startKm + segment.endKm) / 2
    const paddingKm = 80
    const minKm = Math.max(0, segment.startKm - paddingKm)
    const maxKm = segment.endKm + paddingKm

    const inRange = optionsWithDistance
      .filter((option) => {
        const km = option.distance_from_start_km as number
        return km >= minKm && km <= maxKm
      })
      .sort((a, b) => (a.distance_from_start_km as number) - (b.distance_from_start_km as number))

    if (inRange.length > 0) return inRange

    return [...optionsWithDistance].sort(
      (a, b) =>
        Math.abs((a.distance_from_start_km as number) - midpoint) -
        Math.abs((b.distance_from_start_km as number) - midpoint)
    )
  }, [])

  // Pre-compute each day's selection sequentially — single source of truth for dedup
  const resolvedDaySelections = useMemo(() => {
    const usedIds = new Set<string>(excludedOptionIds)
    return daySegments.map((seg, i) => {
      const allOptions = filterStopsBySegmentDistance(seg, [...seg.verifiedStops, ...seg.otherStops])
      const visible = allOptions.filter((o) => !excludedOptionIds.has(o.id))
      const explicitId = selectedSegmentOptionIds[i]
      if (explicitId) {
        const explicit = visible.find((o) => o.id === explicitId)
        if (explicit) { usedIds.add(explicit.id); return explicit }
      }
      const pick = visible.find((o) => !usedIds.has(o.id)) ?? null
      if (pick) usedIds.add(pick.id)
      return pick
    })
  }, [daySegments, selectedSegmentOptionIds, excludedOptionIds, filterStopsBySegmentDistance])

  const getSelectedOption = (segment: RouteSegment, segmentIndex?: number) => {
    if (segmentIndex !== undefined) {
      const resolved = resolvedDaySelections[segmentIndex]
      return resolved ?? undefined
    }
    const allOptions = filterStopsBySegmentDistance(segment, [...segment.verifiedStops, ...segment.otherStops])
    return allOptions.filter((o) => !excludedOptionIds.has(o.id))[0]
  }

  const getSegmentOptions = (segment: RouteSegment, maxOptions = 3) => {
    const allOptions = [...segment.verifiedStops, ...segment.otherStops]
    return filterStopsBySegmentDistance(segment, allOptions).slice(0, maxOptions)
  }

  const averageKmPerDay = () => {
    const totalKm = routeMeta.drivingInfo?.totalDistanceKm
    const days = computeEstimatedDays()
    return totalKm && days ? Math.round(totalKm / days) : 0
  }

  const fuelCriticalCount = () => {
    return daySegments.filter((segment) => segment.fuelCritical).length
  }

  const remoteSectionCount = () => {
    return daySegments.filter((segment) => segment.isRemote).length
  }

  const getRegionLabel = (segment: RouteSegment, index: number) => {
    const selected = getSelectedOption(segment, index)
    if (selected?.region) return selected.region
    if (selected?.state) return selected.state
    return index === 0 ? trip?.start_location_text ?? "Start" : index === daySegments.length - 1 ? trip?.destination_text ?? "Destination" : `Day ${index + 1}`
  }

  const getFuelInfoForSegment = (segment: RouteSegment, segmentIndex: number) => {
    if (!includeFuelPlanning) return []

    const pickStationsForSegment = (stations: FuelStation[]) => {
      const withDistance = stations.filter(
        (station) => typeof station.distanceFromStartKm === "number" && Number.isFinite(station.distanceFromStartKm)
      )

      if (withDistance.length > 0) {
        const segmentPaddingKm = 40
        const segmentStart = Math.max(0, segment.startKm - segmentPaddingKm)
        const segmentEnd = segment.endKm + segmentPaddingKm
        const midpoint = (segment.startKm + segment.endKm) / 2

        if (withDistance.length === 1) {
          const onlyStation = withDistance[0]
          const stationDistance = onlyStation.distanceFromStartKm as number
          const nearestSegmentIndex = daySegments.reduce((bestIdx, daySegment, idx) => {
            const dayMidpoint = (daySegment.startKm + daySegment.endKm) / 2
            const bestMidpoint = (daySegments[bestIdx].startKm + daySegments[bestIdx].endKm) / 2
            const currentGap = Math.abs(dayMidpoint - stationDistance)
            const bestGap = Math.abs(bestMidpoint - stationDistance)
            return currentGap < bestGap ? idx : bestIdx
          }, 0)

          return segmentIndex === nearestSegmentIndex ? [onlyStation] : []
        }

        const inSegment = withDistance
          .filter((station) => {
            const distance = station.distanceFromStartKm as number
            return distance >= segmentStart && distance <= segmentEnd
          })
          .sort((a, b) => (a.distanceFromStartKm as number) - (b.distanceFromStartKm as number))

        if (inSegment.length > 0) {
          return inSegment.slice(0, 3)
        }

        return [...withDistance]
          .sort(
            (a, b) =>
              Math.abs((a.distanceFromStartKm as number) - midpoint) -
              Math.abs((b.distanceFromStartKm as number) - midpoint)
          )
          .slice(0, 3)
      }

      if (stations.length === 1) {
        return segmentIndex === 0 ? stations : []
      }

      // If station distances are unavailable, rotate fallback suggestions by segment
      // so the same fuel stop does not appear on every single day card.
      if (stations.length <= 3) {
        return [stations[segmentIndex % stations.length]]
      }

      const startIndex = segmentIndex % stations.length
      const rotated = [...stations.slice(startIndex), ...stations.slice(0, startIndex)]
      return rotated.slice(0, 2)
    }

    if (segment.fuelSuggestions && segment.fuelSuggestions.length > 0) {
      return pickStationsForSegment(segment.fuelSuggestions)
    }

    if (!routeMeta.fuelStations || routeMeta.fuelStations.length === 0) return []
    return pickStationsForSegment(routeMeta.fuelStations)
  }

  const getFuelStationKey = (station: FuelStation) => {
    return station.id || `${station.name}-${station.lat}-${station.lng}`
  }

  const getSelectedFuelSuggestion = (segment: RouteSegment, segmentIndex: number) => {
    const options = getFuelInfoForSegment(segment, segmentIndex)
    if (options.length === 0) return null

    const selectedId = selectedSegmentFuelIds[segmentIndex]
    const selected = options.find((station) => getFuelStationKey(station) === selectedId)
    if (selected) return selected

    if (segment.primaryFuelSuggestion) {
      const primaryKey = getFuelStationKey(segment.primaryFuelSuggestion)
      const fromOptions = options.find((station) => getFuelStationKey(station) === primaryKey)
      if (fromOptions) return fromOptions
    }

    return options[0]
  }

  const getFuelGapInfo = (segment: RouteSegment, index: number) => {
    const totalKm = routeMeta.drivingInfo?.totalDistanceKm ?? 0
    const paceConfig = routeMeta.paceConfig
    const progress = totalKm > 0 ? (segment.startKm + segment.endKm) / 2 / totalKm : 0
    const northbound = (trip?.destination_lat ?? 0) > (trip?.start_lat ?? 0)
    const northWeight = northbound ? clamp((progress - 0.55) * 2.2, 0, 1) : 0
    const fuelSafeKm = clamp(230 - northWeight * 70, 150, 230)

    const gapFromLast = segment.gapFromLastFuelKm
    const gapToNext = segment.gapToNextFuelKm
    const distanceIntoLeg = segment.fuelDistanceIntoLegKm

    const lastGapExceeds = gapFromLast !== undefined && gapFromLast > fuelSafeKm
    const nextGapExceeds = gapToNext !== undefined && gapToNext > fuelSafeKm

    return {
      gapFromLast,
      gapToNext,
      distanceIntoLeg,
      fuelSafeKm,
      lastGapExceeds,
      nextGapExceeds,
      hasFuel: !!segment.primaryFuelSuggestion,
    }
  }

  const longestFuelGapKm = () => {
    if (!routeMeta.segments) return 0
    const gaps = routeMeta.segments
      .map((s) => s.gapFromLastFuelKm ?? 0)
      .filter((g) => g > 0)
    return gaps.length > 0 ? Math.max(...gaps) : 0
  }

  const clamp = (value: number, min: number, max: number) => {
    return Math.max(min, Math.min(max, value))
  }

  const validateFuelAfterEdit = useCallback((removedStopId: string, removedStopName: string) => {
    if (!includeFuelPlanning) return

    const warnings: string[] = []
    const totalKm = routeMeta.drivingInfo?.totalDistanceKm ?? 0

    const removedStop = stops.find((s) => s.id === removedStopId)
    const removedStopDistance = removedStop?.distance_from_start_km ?? 0

    for (let i = 0; i < daySegments.length; i++) {
      const segment = daySegments[i]
      const segmentDistance = segment.endKm - segment.startKm
      const progress = totalKm > 0 ? (segment.startKm + segment.endKm) / 2 / totalKm : 0
      const northbound = (trip?.destination_lat ?? 0) > (trip?.start_lat ?? 0)
      const northWeight = northbound ? clamp((progress - 0.55) * 2.2, 0, 1) : 0
      const fuelSafeKm = clamp(230 - northWeight * 70, 150, 230)

      const gapFromLast = segment.gapFromLastFuelKm
      const gapToNext = segment.gapToNextFuelKm

      const isAffectedByRemoval =
        removedStopDistance >= segment.startKm - 40 &&
        removedStopDistance <= segment.endKm + 40

      if (segment.isRemote || segment.fuelCritical || isAffectedByRemoval) {
        if (gapFromLast !== undefined && gapFromLast > fuelSafeKm) {
          warnings.push(
            `Day ${i + 1}: ${Math.round(gapFromLast)} km since last fuel${isAffectedByRemoval ? ` — removing "${removedStopName}" may worsen this gap` : ""}`
          )
        }
        if (gapToNext !== undefined && gapToNext > fuelSafeKm) {
          warnings.push(
            `Day ${i + 1}: Next fuel ${Math.round(gapToNext)} km away${isAffectedByRemoval ? ` — "${removedStopName}" removal leaves a larger gap ahead` : ""}`
          )
        }
        if (segment.fuelCritical && (!segment.fuelSuggestions || segment.fuelSuggestions.length === 0)) {
          warnings.push(
            `Day ${i + 1}: Fuel-critical leg with no fuel suggestions${isAffectedByRemoval ? ` — removing "${removedStopName}" is not recommended` : ""}`
          )
        }
      }
    }

    if (warnings.length > 0) {
      setEditWarnings(warnings)
      setShowEditWarningBanner(true)
      toast.warning("Fuel gap warning — check details before confirming", { duration: 5000 })
    }
  }, [daySegments, routeMeta.drivingInfo, trip?.destination_lat, trip?.start_lat, includeFuelPlanning, stops, clamp])

  const dismissEditWarning = () => {
    setShowEditWarningBanner(false)
    setEditWarnings([])
  }

  const fuelStationCount = () => {
    return routeMeta.fuelStations?.length ?? 0
  }

  const loadRouteOptions = async () => {
    if (!trip?.start_lat || !trip?.start_lng || !trip?.destination_lat || !trip?.destination_lng) {
      return
    }

    setRouteOptionsLoading(true)
    try {
      const response = await fetch("/api/stops/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startLat: trip.start_lat,
          startLng: trip.start_lng,
          destLat: trip.destination_lat,
          destLng: trip.destination_lng,
          travelPace: trip.travel_pace || "moderate",
          tripId,
          preferredLegKm: preferredLegLengthKm,
          avoidLongDays,
          preferVerified: preferVerifiedStops,
          includeFreeCamps,
          includeAlternatives: true,
        }),
      })
      const data = await response.json()
      if (data.success) {
        setRouteMeta({
          corridor: data.corridor,
          drivingInfo: data.drivingInfo,
          paceConfig: data.paceConfig,
          segments: data.segments,
          fuelStations: data.fuelStations,
          planningMode: data.planningMode,
        })
      }
    } catch (error) {
      console.error("Error loading route options:", error)
    } finally {
      setRouteOptionsLoading(false)
    }
  }

  useEffect(() => {
    if (!trip) return
    loadRouteOptions()
  }, [trip?.start_lat, trip?.start_lng, trip?.destination_lat, trip?.destination_lng, trip?.travel_pace, tripId])

  useEffect(() => {
    if (routeMeta.fuelStations && routeMeta.fuelStations.length > 0) {
      setFuelStations(routeMeta.fuelStations.map((station, index) => ({
        id: station.name || `fuel-${index}`,
        name: station.name,
        lat: station.lat,
        lng: station.lng,
        address: station.address,
        isOpenNow: station.isOpenNow,
        rating: station.rating,
        distanceFromStartKm: station.distanceFromStartKm,
      })))
    } else {
      setFuelStations([])
    }
  }, [routeMeta.fuelStations])

  useEffect(() => {
    const warnings: string[] = []
    if (routeMeta.corridor?.toLowerCase().includes("outback")) {
      warnings.push("Remote area ahead with longer gaps between services.")
    }
    if (routeMeta.fuelStations && routeMeta.fuelStations.length < 6) {
      warnings.push("Fuel stops are sparse; plan refuels carefully.")
    }
    if (daySegments.some((segment) => segment.fuelCritical && (!segment.fuelSuggestions || segment.fuelSuggestions.length === 0))) {
      warnings.push("A fuel-critical segment has limited fuel coverage. Consider shorter legs or manual fuel additions.")
    }
    if (daySegments.some((segment) => (segment.verifiedStops?.length || 0) === 0)) {
      warnings.push("Some segments have few verified overnight stop options.")
    }
    if (daySegments.some((segment) => segment.degradedMode)) {
      warnings.push("Remote fallback mode active on at least one segment. Options are fewer but route remains usable.")
    }
    if (routeMeta.planningMode === "degraded-valid") {
      warnings.push("Planner is in degraded-valid mode for remote stretches. Fuel and overnight picks are still route-safe, but alternatives may be limited.")
    }
    setRouteWarnings(warnings)
  }, [routeMeta.corridor, routeMeta.fuelStations, routeMeta.planningMode, daySegments])

  useEffect(() => {
    async function fetchTripData() {
      if (!tripId) return
      const storedUser = getStoredUser()
      const uid = storedUser?.id

      if (!uid) { router.replace("/login"); return }
      if (!hasAccess()) { router.replace("/no-access"); return }

      try {
        const response = await fetch(`/api/trips/${tripId}${uid ? `?user_id=${uid}` : ""}`)
        const data = await response.json()

        if (data.success && data.trip) {
          setTrip(data.trip)
          const routeJson = (data.trip as TripData).route_data_json ?? {}
          const savedNarrative = routeJson.narrative as TripNarrative | undefined
          if (savedNarrative?.days?.length) {
            setTripNarrative(savedNarrative)
          }
          // Restore segment selections saved from previous session (§7.9)
          if (routeJson.selectedSegmentOptionIds) {
            setSelectedSegmentOptionIds(routeJson.selectedSegmentOptionIds as Record<number, string>)
          }
          if (routeJson.selectedSegmentFuelIds) {
            setSelectedSegmentFuelIds(routeJson.selectedSegmentFuelIds as Record<number, string>)
          }
        }

        // Load itinerary versions + chat history in parallel with stops
        if (uid) {
          fetch(`/api/trips/${tripId}/itineraries?user_id=${uid}`)
            .then((r) => r.json())
            .then((d) => {
              if (d.success) {
                setItineraryVersions(d.itineraries)
                setItineraryVersionsLoaded(true)
              }
            })
            .catch(() => {})

          fetch(`/api/trips/${tripId}/messages?user_id=${uid}`)
            .then((r) => r.json())
            .then((d) => {
              if (d.success) {
                setChatMessages(d.messages)
                setChatMessagesLoaded(true)
              }
            })
            .catch(() => {})
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

        // Sort stops by distance from trip start so map markers and waypoints are in route order
        if (data.trip?.start_lat && data.trip?.start_lng) {
          const startLat = data.trip.start_lat as number
          const startLng = data.trip.start_lng as number
          const toRad = (d: number) => (d * Math.PI) / 180
          const distFromStart = (lat: number, lng: number) => {
            const dLat = toRad(lat - startLat)
            const dLng = toRad(lng - startLng)
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(startLat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2
            return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
          }
          formattedStops.sort((a, b) => {
            const latA = parseFloat(a.latitude), lngA = parseFloat(a.longitude)
            const latB = parseFloat(b.latitude), lngB = parseFloat(b.longitude)
            if (isNaN(latA) || isNaN(lngA)) return 1
            if (isNaN(latB) || isNaN(lngB)) return -1
            return distFromStart(latA, lngA) - distFromStart(latB, lngB)
          })
        }

        console.log("Formatted stops:", formattedStops)

        setStops(formattedStops)
        setFilteredStops(formattedStops)
      } catch (error) {
        console.error("Error fetching trip:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchTripData()
  }, [tripId])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages])

  const mapCenter = useMemo(() => {
    if (trip?.start_lat && trip?.start_lng) {
      return { lat: trip.start_lat, lng: trip.start_lng }
    }
    return { lat: -25.2744, lng: 133.7751 }
  }, [trip])

  const isNearEndpointMarker = (lat: number, lng: number) => {
    if (!trip) return false

    const overlapKm = 3
    const nearStart =
      trip.start_lat !== null &&
      trip.start_lng !== null &&
      haversineKm(lat, lng, trip.start_lat, trip.start_lng) <= overlapKm

    const nearDestination =
      trip.destination_lat !== null &&
      trip.destination_lng !== null &&
      haversineKm(lat, lng, trip.destination_lat, trip.destination_lng) <= overlapKm

    return nearStart || nearDestination
  }

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
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur-xl">
        <div className="container mx-auto px-6 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
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
                  <h1 className="text-2xl font-bold truncate">{trip.title}</h1>
                  <p className="mt-1 text-sm text-muted-foreground truncate">
                    {trip.start_location_text} → {trip.destination_text}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline" className="bg-primary/5 border-primary/20">
                  {trip.status}
                </Badge>
                <span>{capitalize(trip.travel_pace)} pace</span>
                <span>•</span>
                <span>{computeEstimatedDays()} days</span>
                <span>•</span>
                <span>{routeMeta.drivingInfo ? formatDistance(routeMeta.drivingInfo.totalDistanceKm) : "— km"}</span>
                <span>•</span>
                <span>{routeMeta.drivingInfo ? formatDuration(routeMeta.drivingInfo.totalDurationMinutes) : "— hrs"}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateNarrative}
                disabled={narrativeLoading || !routeMeta.segments?.length}
              >
                {narrativeLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {narrativeLoading ? "Generating..." : tripNarrative ? "Regenerate" : "AI Narrative"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleSaveTrip} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportPdf}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
              <Button variant="secondary" size="sm" onClick={() => router.push(`/planner/${tripId}/edit`)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Trip
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-4">
        <div className="mb-6 grid gap-4 lg:grid-cols-[1.8fr_1fr]">
          <Card className="border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Route Overview</CardTitle>
                {routeMeta.corridor && (
                  <Badge variant="secondary" className="rounded-full px-3 py-1 text-sm">
                    {routeMeta.corridor}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl bg-linear-to-r from-primary/5 to-primary/10 p-4 border border-primary/10">
                <div className="flex items-center gap-3 mb-3">
                  <MapPin className="h-5 w-5 text-primary" />
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold">{trip.start_location_text}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-semibold">{trip.destination_text}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-xs text-muted-foreground">Distance</div>
                    <div className="text-lg font-bold">{routeMeta.drivingInfo ? formatDistance(routeMeta.drivingInfo.totalDistanceKm) : "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Drive time</div>
                    <div className="text-lg font-bold">{routeMeta.drivingInfo ? formatDuration(routeMeta.drivingInfo.totalDurationMinutes) : "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Suggested days</div>
                    <div className="text-lg font-bold">{routeMeta.drivingInfo ? `${computeEstimatedDays()}` : `${trip.trip_duration_days}`}</div>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Route corridor</div>
                  <div className="font-medium">{routeMeta.corridor || "Calculating route corridor..."}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Travel style</div>
                  <div className="font-medium">{capitalize(trip.travel_pace) || "Moderate"}</div>
                </div>
              </div>
              <div className="rounded-2xl bg-muted/5 p-4 text-sm">
                <div className="font-medium text-foreground mb-1">Route description</div>
                <p className="text-muted-foreground">{getRouteDescription()}</p>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-2">Why this plan works</div>
                <ul className="space-y-2 text-sm">
                  <li>Balanced driving days based on selected pace.</li>
                  <li>Overnight stop options grouped along the route.</li>
                  <li>Fuel considered before more remote northern stretches.</li>
                </ul>
              </div>
            </CardContent>
          </Card>
          <Card className="border">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Planning Alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {routeOptionsLoading ? (
                <div className="text-muted-foreground">Loading route alerts…</div>
              ) : routeWarnings.length > 0 ? (
                <ul className="space-y-2">
                  {routeWarnings.map((warning, index) => (
                    <li key={index} className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                      {warning}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="space-y-2">
                  <p className="text-muted-foreground">No major route alerts detected.</p>
                  <p>Expect a sensible plan with pacing, stops and fuel considered along the route.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {showEditWarningBanner && editWarnings.length > 0 && (
          <Card className="border-amber-500/40 bg-amber-500/5 mb-4">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Fuel className="h-5 w-5 text-amber-600" />
                  Fuel Gap Warning
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={dismissEditWarning}>Dismiss</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-amber-800 font-medium">
                Removing stops may create fuel gaps in remote sections. Review before confirming:
              </p>
              <ul className="space-y-1">
                {editWarnings.map((warning, index) => (
                  <li key={index} className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-amber-800">
                    {warning}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground mt-2">
                You can still proceed, but consider adding an alternate fuel stop or shortening this leg.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="mb-4">
          <Card className="overflow-hidden border py-0 relative">
            <div className="absolute right-4 top-4 z-20 flex flex-col gap-2">
              <Button
                variant={showFuelOverlay ? "default" : "secondary"}
                size="icon"
                onClick={() => setShowFuelOverlay(prev => !prev)}
                title={showFuelOverlay ? "Hide fuel stations" : "Show fuel stations"}
              >
                F
              </Button>
              <Button
                variant={showOvernightOverlay ? "default" : "secondary"}
                size="icon"
                onClick={() => setShowOvernightOverlay(prev => !prev)}
                title={showOvernightOverlay ? "Hide overnight options" : "Show overnight options"}
              >
                O
              </Button>
              <Button
                variant={showRemoteOverlay ? "default" : "secondary"}
                size="icon"
                onClick={() => setShowRemoteOverlay(prev => !prev)}
                title={showRemoteOverlay ? "Hide remote warnings" : "Show remote warnings"}
              >
                R
              </Button>
              <Button variant="secondary" size="icon" onClick={() => map?.panTo(mapCenter)} title="Recenter route">⟳</Button>
            </div>
            <CardContent className="p-0">
              <div className="h-100 bg-muted/20">
                <LoadScript
                  googleMapsApiKey={process.env.NEXT_PUBLIC_GMAPS_API_KEY!}
                  libraries={googleMapsLibraries}
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

                    {filteredStops.length > 0 && filteredStops.map((stop, index) => {
                      const lat = parseFloat(stop.latitude)
                      const lng = parseFloat(stop.longitude)
                      if (isNaN(lat) || isNaN(lng)) return null
                      if (isNearEndpointMarker(lat, lng)) return null
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

                    {filteredStops.length === 0 && daySegments.map((segment, segIndex) => [
                      ...segment.verifiedStops,
                      ...segment.otherStops,
                    ]).flat().map((stop, index) => {
                      const lat = parseFloat(stop.latitude ?? "0")
                      const lng = parseFloat(stop.longitude ?? "0")
                      if (isNaN(lat) || isNaN(lng)) return null
                      if (isNearEndpointMarker(lat, lng)) return null
                      return (
                        <Marker
                          key={`segment-stop-${stop.id}`}
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

                    {showOvernightOverlay && daySegments.map((segment, index) => {
                      const selected = getSelectedOption(segment, index)
                      if (!selected) return null
                      const lat = parseFloat(selected.latitude ?? "0")
                      const lng = parseFloat(selected.longitude ?? "0")
                      if (isNaN(lat) || isNaN(lng)) return null
                      return (
                        <Marker
                          key={`overnight-${index}`}
                          position={{ lat, lng }}
                          label={{
                            text: `D${index + 1}`,
                            color: "white",
                            fontWeight: "bold",
                            fontSize: "10px",
                          }}
                          title={`Day ${index + 1}: ${selected.location_name}`}
                        />
                      )
                    })}

                    {showFuelOverlay && fuelStations.map((station, index) => {
                      const distKm = station.distanceFromStartKm
                        ? Math.round(station.distanceFromStartKm)
                        : null
                      const labelText = distKm !== null
                        ? `${distKm}km`
                        : `F${index + 1}`
                      return (
                        <Marker
                          key={station.id}
                          position={{ lat: station.lat, lng: station.lng }}
                          label={{
                            text: labelText,
                            color: "white",
                            fontWeight: "bold",
                            fontSize: distKm !== null ? "9px" : "10px",
                          }}
                          icon={{
                            path: google.maps.SymbolPath.CIRCLE,
                            fillColor: "#ea580c",
                            fillOpacity: 0.9,
                            strokeColor: "#c2410c",
                            strokeWeight: 1,
                            scale: distKm !== null ? 14 : 11,
                          }}
                          title={`${station.name}${distKm !== null ? ` — ${distKm} km from start` : ""}`}
                        />
                      )
                    })}

                    {showRemoteOverlay && routeMeta.segments?.map((segment, index) => {
                      const distance = estimateSegmentDistance(segment)
                      if (getSegmentDayType(distance) !== "Remote") return null
                      const allStops = [...segment.verifiedStops, ...segment.otherStops]
                      const midStop = allStops[Math.floor(allStops.length / 2)]
                      if (!midStop) return null
                      const lat = parseFloat(midStop.latitude ?? "0")
                      const lng = parseFloat(midStop.longitude ?? "0")
                      if (isNaN(lat) || isNaN(lng)) return null
                      return (
                        <Marker
                          key={`remote-${index}`}
                          position={{ lat, lng }}
                          label={{
                            text: "!",
                            color: "white",
                            fontWeight: "bold",
                            fontSize: "14px",
                          }}
                          title={`Remote section: Day ${index + 1} (${Math.round(distance)} km)`}
                        />
                      )
                    })}
                  </GoogleMap>
                </LoadScript>
              </div>
            </CardContent>
          </Card>
        </div>


        <div className="grid gap-6 lg:grid-cols-[2.2fr_1fr] mb-8">
          <div className="space-y-6">
            <Card className="border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Route overview</CardTitle>
                  {routeMeta.corridor && (
                    <Badge variant="outline" className="text-xs">
                      {routeMeta.corridor}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              {routeMeta.planningMode === "degraded-valid" && (
                <div className="px-6 pb-2">
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
                    Remote fallback planning is active for parts of this route. Keep larger fuel buffers on long legs.
                  </div>
                </div>
              )}
              <CardContent className="grid gap-4 sm:grid-cols-4">
                <div>
                  <div className="text-sm text-muted-foreground">Total days</div>
                  <div className="mt-1 text-base font-semibold">{computeEstimatedDays()} days</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Total distance</div>
                  <div className="mt-1 text-base font-semibold">{routeMeta.drivingInfo ? formatDistance(routeMeta.drivingInfo.totalDistanceKm) : "—"}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Avg. km/day</div>
                  <div className="mt-1 text-base font-semibold">{averageKmPerDay()} km</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Critical sections</div>
                  <div className="mt-1 text-base font-semibold">{fuelCriticalCount()} fuel-critical / {remoteSectionCount()} remote</div>
                </div>
              </CardContent>
            </Card>

            {showPlanningSkeleton
              ? Array.from({ length: targetDays }, (_, idx) => (
                <Card key={`day-skeleton-${idx}`} className="border">
                  <div className="border-b px-4 py-4 sm:px-5 sm:py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
                      <div className="space-y-2">
                        <div className="h-5 w-40 rounded bg-muted animate-pulse" />
                        <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                      </div>
                    </div>
                  </div>
                  <CardContent className="space-y-3 px-4 py-4 sm:px-5 sm:py-5">
                    <div className="h-20 rounded-2xl bg-muted animate-pulse" />
                    <div className="h-20 rounded-2xl bg-muted animate-pulse" />
                  </CardContent>
                </Card>
              ))
              : daySegments.map((segment, index) => {
                const distance = estimateSegmentDistance(segment)
                const duration = estimateSegmentDuration(segment)
                const region = getRegionLabel(segment, index)
                const remainingAfterThisDayKm = Math.max(0, totalRouteDistanceKm - segment.endKm)
                const fuelInfo = getFuelInfoForSegment(segment, index)
                const selectedOption = getSelectedOption(segment, index)
                const previousSelectedOption = index > 0 ? getSelectedOption(daySegments[index - 1], index - 1) : null
                const nextSelectedOption = index < daySegments.length - 1 ? getSelectedOption(daySegments[index + 1], index + 1) : null
                const dayStartName = index === 0
                  ? trip.start_location_text
                  : (previousSelectedOption?.location_name || getRegionLabel(daySegments[index - 1], index - 1))
                const dayEndName = index === daySegments.length - 1
                  ? trip.destination_text
                  : (selectedOption?.location_name || nextSelectedOption?.location_name || getRegionLabel(segment, index))
                const expanded = expandedSegments.has(index)
                const active = activeSegmentIndex === index

                const allStops = filterStopsBySegmentDistance(segment, [...segment.verifiedStops, ...segment.otherStops])
                const overnightStops = allStops.slice(0, 3)
                const overnightStopsSorted = [...overnightStops].sort(
                  (a, b) => (a.distance_from_start_km ?? Number.MAX_SAFE_INTEGER) - (b.distance_from_start_km ?? Number.MAX_SAFE_INTEGER)
                )
                const persistedStopIds = new Set(
                  stops
                    .filter((stop) => stop.verification_status !== "custom")
                    .map((stop) => stop.stop_id || stop.id)
                )
                const persistedStopsForSegment = overnightStopsSorted.filter((stop) => persistedStopIds.has(stop.id))
                // IDs already shown as A (start) or B (end) — exclude from route waypoint pins
                const endpointStopIds = new Set<string>([
                  ...(previousSelectedOption ? [previousSelectedOption.id] : []),
                  ...(selectedOption ? [selectedOption.id] : []),
                  ...(nextSelectedOption ? [nextSelectedOption.id] : []),
                ].map((id) => normalizeStopId(id)).filter(Boolean))
                const endpointStopNames = new Set<string>([
                  previousSelectedOption?.location_name,
                  selectedOption?.location_name,
                  nextSelectedOption?.location_name,
                ].filter(Boolean).map((name) => String(name).toLowerCase().trim()))
                const rawRouteStops = getOrderedRouteStops(
                  index,
                  persistedStopsForSegment.length > 0 ? persistedStopsForSegment : allStops.slice(0, 1)
                )
                const routeStops = rawRouteStops.filter((stop) => !endpointStopIds.has(normalizeStopId(stop.id)))
                const routeStopIds = new Set(routeStops.map((stop) => normalizeStopId(stop.id)).filter(Boolean))
                const hiddenCustomKeysForDay = new Set(hiddenCustomStopsByDay[index] || [])
                const customStopsForDay = stops.filter((stop) => {
                  if (stop.verification_status !== "custom") return false

                  const stopDistance = Number(stop.distance_from_start_km)
                  const inSegmentWindow = Number.isFinite(stopDistance)
                    ? stopDistance >= segment.startKm && stopDistance < segment.endKm
                    : stop.day_index === index

                  if (!inSegmentWindow) return false

                  const normalizedId = normalizeStopId(stop.stop_id || stop.id)
                  const normalizedName = stop.location_name.toLowerCase().trim()
                  const displayKey = getCustomStopDisplayKey(stop)
                  return !routeStopIds.has(normalizedId)
                    && !endpointStopIds.has(normalizedId)
                    && !endpointStopNames.has(normalizedName)
                    && !hiddenCustomKeysForDay.has(displayKey)
                })
                const seenCustomStopKeys = new Set<string>()
                const dedupedCustomStopsForDay = customStopsForDay.filter((stop) => {
                  const key = getCustomStopDisplayKey(stop)

                  if (seenCustomStopKeys.has(key)) return false
                  seenCustomStopKeys.add(key)
                  return true
                })
                // Sort custom stops by route distance to match map order
                const sortedCustomStopsForDay = [...dedupedCustomStopsForDay].sort(
                  (a, b) => (a.distance_from_start_km ?? 999999) - (b.distance_from_start_km ?? 999999)
                )
                
                // Compute global stop number for each custom stop (1, 2, 3...)
                const getGlobalStopNumber = (customStop: TripStop) => {
                  let count = 0
                  for (const stop of filteredStops) {
                    if (stop.id === customStop.id) return count + 1
                    count++
                  }
                  return count
                }
                
                const visibleCustomStopsForDay = sortedCustomStopsForDay
                const hiddenCustomStopsCount = 0
                const displayedRouteStopIds = new Set<string>([
                  ...routeStops.map((stop) => normalizeStopId(stop.id)),
                  ...visibleCustomStopsForDay.map((stop) => normalizeStopId(stop.stop_id || stop.id)),
                  normalizeStopId(selectedOption?.id),
                ].filter(Boolean))
                const displayedRouteStopNames = new Set<string>([
                  ...routeStops.map((stop) => stop.location_name.toLowerCase().trim()),
                  ...visibleCustomStopsForDay.map((stop) => stop.location_name.toLowerCase().trim()),
                  selectedOption?.location_name?.toLowerCase().trim(),
                ].filter(Boolean) as string[])
                const alternateStops = allStops.filter((stop) => {
                  const normalizedId = normalizeStopId(stop.id)
                  const normalizedName = stop.location_name.toLowerCase().trim()
                  return !routeStopIds.has(normalizedId)
                    && !endpointStopIds.has(normalizedId)
                    && !displayedRouteStopIds.has(normalizedId)
                    && !displayedRouteStopNames.has(normalizedName)
                })
                const optionsToShow = expandedSegmentOptions.has(index)
                  ? alternateStops
                  : alternateStops.slice(0, 3)
                const knownNames = new Set(
                  [
                    ...allStops.map((stop) => stop.location_name.toLowerCase()),
                    ...stops.map((stop) => stop.location_name.toLowerCase()),
                  ]
                )
                const nearbyAlternatives = (nearbyPlaces[index] || [])
                  .filter((place) => !knownNames.has(place.name.toLowerCase()))
                  .slice(0, 5)
                const selectedFuelSuggestion = getSelectedFuelSuggestion(segment, index)
                const draggableRouteStops = routeStops.filter((stop) => stop.is_verified)
                const staticRouteStops = routeStops.filter((stop) => !stop.is_verified)

                return (
                  <Card key={`day-card-${index}`} className={active ? "border-primary shadow-lg" : "border"}>
                    <div className="border-b px-4 py-4 sm:px-5 sm:py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                            {index + 1}
                          </div>
                          <div>
                            <h2 className="text-lg font-semibold">Day {index + 1}</h2>
                            <p className="text-sm text-muted-foreground">
                              {formatDistance(distance)} • {formatDuration(duration)}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="rounded-full px-3 py-1">
                            {getSegmentDayType(distance)}
                          </Badge>
                          <Button variant="ghost" size="sm" onClick={() => {
                            toggleSegmentExpanded(index)
                            setActiveSegmentIndex(index)
                          }}>
                            {expanded ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
                            {expanded ? "Collapse" : "Expand"}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {expanded && (
                      <CardContent className="space-y-2 px-4 py-4 sm:px-5 sm:py-5">
                        <div className="grid gap-4 lg:grid-cols-1">
                          <div className="rounded-3xl bg-muted/5 p-4">
                            <div className="text-lg text-muted-foreground mb-2">Day summary</div>
                            <div className="text-base">
                              <p><span className="font-medium">Start:</span> {dayStartName}</p>
                              <p><span className="font-medium">End region:</span> {region}</p>
                              <p><span className="font-medium">Distance:</span> {formatDistance(distance)}</p>
                              <p><span className="font-medium">Drive time:</span> {formatDuration(duration)}</p>
                              {index === daySegments.length - 1 && remainingAfterThisDayKm > 0 && (
                                <p><span className="font-medium">Remaining to destination:</span> {formatDistance(remainingAfterThisDayKm)}</p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div>
                          <h3 className="text-sm font-semibold mb-4">Route</h3>
                          <div className="relative">
                            <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />

                            <div className="space-y-4">
                              <div className="flex items-start gap-4">
                                <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500 text-white">
                                  <span className="text-sm font-bold">A</span>
                                </div>
                                <div className="flex-1 rounded-2xl bg-background p-3 border border-muted/30">
                                  <div className="font-medium text-sm">
                                    {dayStartName}
                                  </div>
                                  <div className="text-xs text-muted-foreground">Start point</div>
                                </div>
                              </div>

                              {routeStops.length > 0 && (
                                <div className="space-y-4">
                                  {staticRouteStops.map((stop) => (
                                    <StaticRouteStopItem key={`fixed-stop-${stop.id}`} stop={stop} />
                                  ))}

                                  {draggableRouteStops.length > 0 && (
                                    <DndContext
                                      sensors={dragSensors}
                                      collisionDetection={closestCenter}
                                      onDragEnd={(event) => {
                                        void handleRouteStopDragEnd(index, draggableRouteStops, event)
                                      }}
                                    >
                                      <SortableContext items={draggableRouteStops.map((stop) => stop.id)} strategy={verticalListSortingStrategy}>
                                        <div className="space-y-4">
                                          {draggableRouteStops.map((stop) => (
                                            <SortableRouteStopItem key={`stop-${stop.id}`} stop={stop} />
                                          ))}
                                        </div>
                                      </SortableContext>
                                    </DndContext>
                                  )}
                                </div>
                              )}

                              {routeStops.length === 0 && customStopsForDay.length === 0 && (
                                selectedOption ? (
                                  <div className="rounded-2xl border border-dashed border-muted/30 bg-muted/10 p-3 text-xs text-muted-foreground">
                                    Overnight anchor is set for this leg at point B. Add additional alternatives from Options if needed.
                                  </div>
                                ) : segment.verifiedStops.length === 0 ? (
                                  <div className="rounded-2xl border border-dashed border-amber-400/40 bg-amber-50/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                                    No AAO verified stop on this stretch. This leg has no database-verified overnight options — check nearby alternatives below or add a custom stop.
                                  </div>
                                ) : (
                                  <div className="rounded-2xl border border-dashed border-muted/30 bg-muted/10 p-3 text-xs text-muted-foreground">
                                    No saved route stops for this day yet. Pick from Options to add stops.
                                  </div>
                                )
                              )}

                              {customStopsForDay.length > 0 && (
                                <div className="space-y-4">
                                  {visibleCustomStopsForDay.map((stop) => (
                                    <div key={`custom-stop-${stop.id}`} className="flex items-start gap-4">
                                      <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
                                        <MapPin className="h-5 w-5 text-amber-700" />
                                      </div>
                                      <div className="flex-1 rounded-2xl bg-background p-3 border border-muted/30">
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium text-sm">{stop.location_name}</span>
                                          <Badge variant="outline" className="text-xs">Custom</Badge>
                                          {normalizeStopId(stop.stop_id || stop.id) === normalizeStopId(selectedOption?.id) && (
                                            <Badge variant="secondary" className="text-xs">Selected</Badge>
                                          )}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                          Added from nearby alternatives for Day {index + 1}
                                        </div>
                                        <div className="mt-2">
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => hideCustomStopFromDay(index, stop)}
                                          >
                                            Remove from this day
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                  {hiddenCustomStopsCount > 0 && (
                                    <div className="rounded-2xl border border-dashed border-muted/30 bg-muted/10 p-3 text-xs text-muted-foreground">
                                      +{hiddenCustomStopsCount} more custom alternatives hidden to keep this day route readable.
                                    </div>
                                  )}
                                </div>
                              )}

                              <div className="flex items-start gap-4">
                                <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
                                  <span className="text-sm font-bold">B</span>
                                </div>
                                <div className="flex-1 rounded-2xl bg-background p-3 border border-muted/30">
                                  <div className="font-medium text-sm">
                                    {dayEndName}
                                  </div>
                                  <div className="text-xs text-muted-foreground">End point</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">

                          <div className="rounded-3xl bg-muted/5 p-4">
                            <div className="text-sm text-muted-foreground mb-2">Suggested overnight area</div>
                            <div className="text-base font-semibold">{selectedOption?.region || region}</div>
                            <p className="mt-2 text-sm text-muted-foreground">
                              {selectedOption
                                ? `Planning anchor near ${selectedOption.location_name}. Choose the exact sleep spot (campground, caravan park, hotel, or station stay) that fits your setup.`
                                : `No confirmed overnight region yet. Add a stop option to lock this leg.`}
                            </p>
                            <div className="rounded-3xl bg-muted/5">
                              <div className="text-xl text-muted-foreground mb-3 mt-8">Options</div>
                              <div className="space-y-3">
                                {optionsToShow.length > 0 ? (
                                  optionsToShow.map((option) => {
                                    const selectedId = getSelectedOption(segment, index)?.id
                                    const isSelectedCard = option.id === selectedId
                                    return (
                                      <div
                                        key={option.id}
                                        className={`relative overflow-hidden rounded-3xl border p-4 ${isSelectedCard ? "border-primary bg-primary/5" : "border-muted/30 bg-background"}`}
                                      >
                                        <div className="absolute left-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                                          <MapPin className="h-4 w-4 text-primary" />
                                        </div>
                                        <div className="absolute left-6 top-4 h-2 w-2 rounded-full bg-primary" />
                                        <div className="absolute left-8 top-4 bottom-4 w-px bg-primary/20" />
                                        <div className="ml-8">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="font-semibold text-sm">{option.location_name}</h3>
                                            <Badge variant="outline" className="text-xs">{option.stay_type || option.route_type || "Stop"}</Badge>
                                            {option.is_verified && <Badge variant="outline" className="text-xs">Verified</Badge>}
                                          </div>
                                          <p className="mt-2 text-sm text-muted-foreground">
                                            Suggested area stop for this leg. Confirm your exact overnight place, booking, and access before travel.
                                          </p>
                                          <div className="mt-3 flex flex-wrap gap-2">
                                            <Button variant={getSelectedOption(segment, index)?.id === option.id ? "secondary" : "outline"} size="sm" onClick={() => handleChooseSegmentOption(segment, index, option)}>
                                              {getSelectedOption(segment, index)?.id === option.id ? "Selected" : "Choose this stop"}
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => {
                                                toggleSegmentOptions(index)
                                                void loadNearbyPlacesForDay(index, segment)
                                              }}
                                            >
                                              {expandedSegmentOptions.has(index) ? "Hide alternatives" : "View alternatives"}
                                            </Button>
                                          </div>
                                        </div>
                                      </div>
                                    )
                                  })
                                ) : (
                                  <div className="rounded-3xl border border-dashed border-muted/30 bg-muted/10 p-4 text-sm text-muted-foreground">
                                    No alternate overnight options for this day. Try Rebuild plan to generate different suggestions.
                                  </div>
                                )}

                                {expandedSegmentOptions.has(index) && (
                                  <div className="pt-2">
                                    <div className="text-sm text-muted-foreground mb-2">Nearby alternatives</div>
                                    {loadingPlaces.has(index) ? (
                                      <div className="rounded-2xl border border-dashed border-muted/30 bg-muted/10 p-3 text-sm text-muted-foreground">
                                        Loading nearby alternatives...
                                      </div>
                                    ) : nearbyAlternatives.length > 0 ? (
                                      <div className="space-y-2">
                                        {nearbyAlternatives.map((place) => (
                                          <div key={`${place.name}-${place.lat}-${place.lng}`} className="rounded-2xl border border-muted/30 bg-background p-3">
                                            <div className="flex items-center justify-between gap-3">
                                              <div>
                                                <div className="font-medium text-sm">{place.name}</div>
                                                <div className="text-xs text-muted-foreground">{place.address}</div>
                                              </div>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => void handleAddPlaceToDay(index, {
                                                  name: place.name,
                                                  lat: place.lat,
                                                  lng: place.lng,
                                                  address: place.address,
                                                  type: place.type,
                                                })}
                                              >
                                                Add to route
                                              </Button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="rounded-2xl border border-dashed border-muted/30 bg-muted/10 p-3 text-sm text-muted-foreground">
                                        No nearby alternatives found for this segment.
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="rounded-3xl bg-muted/5 p-4">
                            <div className="text-sm text-muted-foreground mb-3">Fuel planning</div>
                            {(() => {
                              const gapInfo = getFuelGapInfo(segment, index)
                              const hasFuelOptions = fuelInfo.length > 0
                              const warningParts = (segment.fuelWarning || "")
                                .split(" • ")
                                .filter((part) => {
                                  if (!hasFuelOptions) return true
                                  return !part.toLowerCase().includes("no fuel data available")
                                })
                                .filter((part) => part.trim().length > 0)

                              return (
                                <div className="space-y-3">
                                  {selectedFuelSuggestion ? (
                                    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                                      <div className="flex items-center gap-2 mb-1">
                                        <Fuel className="h-4 w-4 text-emerald-600" />
                                        <span className="font-semibold text-sm text-emerald-800">{selectedFuelSuggestion.name}</span>
                                      </div>
                                      {gapInfo.distanceIntoLeg !== undefined && (
                                        <div className="text-xs text-emerald-700">{gapInfo.distanceIntoLeg} km into this leg</div>
                                      )}
                                      {selectedFuelSuggestion.address && (
                                        <div className="text-xs text-emerald-700 mt-1">{selectedFuelSuggestion.address}</div>
                                      )}
                                    </div>
                                  ) : fuelInfo.length > 0 ? (
                                    <p className="text-sm text-muted-foreground">Select a fuel station from the options below.</p>
                                  ) : (
                                    <p className="text-sm text-muted-foreground">No fuel stations found for this leg.</p>
                                  )}

                                  <div className="rounded-3xl bg-muted/5 p-3">
                                    <div className="text-base text-muted-foreground mb-2">Options</div>
                                    {fuelInfo.length > 0 ? (
                                      <div className="space-y-2">
                                        {fuelInfo.map((station) => {
                                          const fuelKey = getFuelStationKey(station)
                                          const isSelected = selectedFuelSuggestion
                                            ? getFuelStationKey(selectedFuelSuggestion) === fuelKey
                                            : false

                                          return (
                                            <div
                                              key={fuelKey}
                                              className={`rounded-2xl border p-3 ${isSelected ? "border-emerald-500/40 bg-emerald-500/10" : "border-muted/30 bg-background"}`}
                                            >
                                              <div className="flex items-center justify-between gap-3">
                                                <div>
                                                  <div className="font-medium text-sm">{station.name}</div>
                                                  <div className="text-xs text-muted-foreground">{station.address}</div>
                                                </div>
                                                <Button
                                                  variant={isSelected ? "secondary" : "outline"}
                                                  size="sm"
                                                  onClick={() => setSelectedSegmentFuelIds((prev) => ({ ...prev, [index]: fuelKey }))}
                                                >
                                                  {isSelected ? "Selected" : "Choose fuel"}
                                                </Button>
                                              </div>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    ) : (
                                      <p className="text-sm text-muted-foreground">No fuel options available for this day.</p>
                                    )}
                                  </div>

                                  {warningParts.length > 0 && (
                                    <div className={`rounded-2xl p-3 text-sm ${segment.fuelCritical || gapInfo.lastGapExceeds || gapInfo.nextGapExceeds
                                        ? "bg-amber-500/10 border border-amber-500/30 text-amber-800"
                                        : "bg-background border border-muted/30 text-muted-foreground"
                                      }`}>
                                      {warningParts.map((part, partIndex) => (
                                        <div key={partIndex} className={partIndex > 0 ? "mt-1" : ""}>
                                          {part}
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {segment.fuelCritical && !segment.fuelWarning?.includes("fuel-critical") && (
                                    <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">
                                      {hasFuelOptions
                                        ? `Fuel-critical leg: verified fuel options exist but the distance between them is long. Keep extra reserve and fill up at every opportunity.`
                                        : `Fuel-critical leg: no verified fuel stops on this stretch. Refuel before leaving and plan for fuel at the next town.`}
                                    </div>
                                  )}
                                </div>
                              )
                            })()}
                          </div>
                        </div>

                        {/* <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleChangeStopForSegment(segment, index)}>
                            Change stop
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleSwapSegmentOption(segment, index)}>
                            Swap option
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleSkipSegmentStop(segment, index)}>
                            Skip stop
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleRebuildSegment(segment, index)}>
                            Rebuild this leg
                          </Button>
                        </div> */}
                      </CardContent>
                    )}
                  </Card>
                )
              })}

            <Card className="border">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Final arrival</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-sm text-muted-foreground">Arrival location</div>
                  <div className="mt-1 font-semibold">{trip.destination_text}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Remaining route</div>
                  <div className="mt-1 text-sm">
                    {routeMeta.drivingInfo
                      ? remainingDistanceKm > 0
                        ? `${formatDistance(remainingDistanceKm)} (${formatDuration(remainingDurationMinutes)}) still beyond current saved plan`
                        : "Fully covered by current saved stops"
                      : "Review route details"}
                  </div>
                </div>
                <div className="rounded-3xl bg-muted/5 p-4 text-sm text-muted-foreground">
                  {remainingDistanceKm > 0
                    ? "Add more saved stops from Options to continue planning the remaining stretch toward destination."
                    : "Arrive ready with local access notes, booking options, and final fuel checks for the destination area."}
                </div>
              </CardContent>
            </Card>

            {/* AI Narrative Card */}
            <Card className="border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    AI Narrative
                    {itineraryVersions.length > 0 && (
                      <span className="text-xs font-normal text-muted-foreground">
                        v{itineraryVersions.find((v) => v.status === "active")?.version ?? itineraryVersions[0]?.version}
                      </span>
                    )}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {itineraryVersions.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowVersionHistory((prev) => !prev)}
                        title="View version history"
                      >
                        <History className="h-4 w-4" />
                        <span className="ml-1 text-xs">{itineraryVersions.length}</span>
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateNarrative}
                      disabled={narrativeLoading || !routeMeta.segments?.length}
                    >
                      {narrativeLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      <span className="ml-2">{narrativeLoading ? "Generating..." : tripNarrative ? "Regenerate" : "Generate"}</span>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Version history panel */}
                {showVersionHistory && itineraryVersions.length > 0 && (
                  <div className="rounded-2xl border border-muted/30 bg-muted/5 p-3 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Version History</p>
                    {itineraryVersions.map((v) => (
                      <div
                        key={v.id}
                        className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${
                          v.status === "active"
                            ? "bg-primary/10 border border-primary/20"
                            : "bg-background border border-muted/20"
                        }`}
                      >
                        <div>
                          <span className="font-medium">v{v.version}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {new Date(v.created_at).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" })}
                          </span>
                          {v.status === "active" && (
                            <span className="ml-2 text-xs text-primary font-medium">active</span>
                          )}
                        </div>
                        {v.status !== "active" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRestoreVersion(v.id)}
                            disabled={restoringVersion === v.id}
                            className="h-7 px-2 text-xs"
                          >
                            {restoringVersion === v.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3 w-3" />
                            )}
                            <span className="ml-1">Restore</span>
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {!tripNarrative && !narrativeLoading && (
                  <div className="rounded-2xl bg-muted/5 p-6 text-center text-sm text-muted-foreground border border-dashed">
                    <Sparkles className="h-8 w-8 mx-auto mb-2 text-primary/40" />
                    <p className="font-medium mb-1">No narrative yet</p>
                    <p>Generate an AI-written overview of your trip with day-by-day highlights and tips.</p>
                  </div>
                )}
                {narrativeLoading && (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="rounded-2xl bg-muted/10 h-20 animate-pulse" />
                    ))}
                  </div>
                )}
                {tripNarrative && !narrativeLoading && (
                  <div className="space-y-4">
                    {/* Overview */}
                    <div className="rounded-2xl bg-primary/5 border border-primary/10 p-4">
                      <p className="text-sm font-medium text-primary mb-1">Overview</p>
                      <p className="text-sm">{tripNarrative.overview}</p>
                    </div>

                    {/* Day-by-day */}
                    {tripNarrative.days.map((day) => (
                      <div key={day.dayNumber} className="rounded-2xl bg-muted/5 border border-muted/20 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                            {day.dayNumber}
                          </div>
                          <span className="text-sm font-semibold">Day {day.dayNumber}</span>
                        </div>

                        <p className="text-sm text-muted-foreground">{day.narrative}</p>

                        {/* Suggested stay — structured fields */}
                        {day.suggestedStay ? (
                          <div className="rounded-xl bg-background border border-muted/30 p-3 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium">{day.suggestedStay.name}</span>
                              {day.suggestedStay.stopType && (
                                <span className="text-xs text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-full capitalize">
                                  {day.suggestedStay.stopType}
                                </span>
                              )}
                            </div>
                            {day.suggestedStay.whyStopHere && (
                              <p className="text-xs text-muted-foreground">{day.suggestedStay.whyStopHere}</p>
                            )}
                            {day.suggestedStay.aaoTip && (
                              <p className="text-xs text-primary/80 italic">&quot;{day.suggestedStay.aaoTip}&quot;</p>
                            )}
                          </div>
                        ) : (
                          day.gapNote && (
                            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-800">
                              {day.gapNote}
                            </div>
                          )
                        )}

                        {/* Extra AAO tips */}
                        {day.aaoTips.length > 0 && (
                          <ul className="space-y-1">
                            {day.aaoTips.map((tip, i) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                                <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
                                {tip}
                              </li>
                            ))}
                          </ul>
                        )}

                        {/* Fuel note */}
                        {day.fuelNote && (
                          <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 px-3 py-2 text-xs text-orange-800 flex items-start gap-2">
                            <Fuel className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            {day.fuelNote}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Trip notes */}
                    {tripNarrative.tripNotes && (tripNarrative.tripNotes.fuelGuidance || tripNarrative.tripNotes.remoteWarnings || tripNarrative.tripNotes.roadConditions) && (
                      <div className="rounded-2xl bg-muted/5 border border-muted/20 p-4 space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Trip Notes</p>
                        {tripNarrative.tripNotes.fuelGuidance && (
                          <p className="text-xs text-muted-foreground flex items-start gap-2">
                            <Fuel className="h-3.5 w-3.5 mt-0.5 shrink-0 text-orange-500" />
                            {tripNarrative.tripNotes.fuelGuidance}
                          </p>
                        )}
                        {tripNarrative.tripNotes.remoteWarnings && (
                          <p className="text-xs text-muted-foreground flex items-start gap-2">
                            <Route className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                            {tripNarrative.tripNotes.remoteWarnings}
                          </p>
                        )}
                        {tripNarrative.tripNotes.roadConditions && (
                          <p className="text-xs text-muted-foreground flex items-start gap-2">
                            <Caravan className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                            {tripNarrative.tripNotes.roadConditions}
                          </p>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground text-right">
                      Generated {new Date(tripNarrative.generatedAt).toLocaleString("en-AU")}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5">
            <Card className="border">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Planning controls</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <div className="text-sm text-muted-foreground mb-2">Travel pace</div>
                  <div className="flex flex-wrap gap-2">
                    {['leisure', 'moderate', 'brisk'].map((pace) => (
                      <Button
                        key={pace}
                        variant={trip.travel_pace === pace ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={() => toast(`Selected ${pace}`)}
                      >
                        {capitalize(pace)}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-2">Preferred leg length</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={preferredLegLengthKm}
                      onChange={(event) => setPreferredLegLengthKm(Number(event.target.value))}
                      className="w-24 rounded-lg border bg-background px-3 py-2 text-sm outline-none"
                    />
                    <span className="text-sm text-muted-foreground">km</span>
                  </div>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Avoid long days</span>
                    <Button variant={avoidLongDays ? 'secondary' : 'outline'} size="sm" onClick={() => setAvoidLongDays((value) => !value)}>
                      {avoidLongDays ? 'On' : 'Off'}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Prefer verified stops</span>
                    <Button variant={preferVerifiedStops ? 'secondary' : 'outline'} size="sm" onClick={() => setPreferVerifiedStops((value) => !value)}>
                      {preferVerifiedStops ? 'On' : 'Off'}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Include free camps</span>
                    <Button variant={includeFreeCamps ? 'secondary' : 'outline'} size="sm" onClick={() => setIncludeFreeCamps((value) => !value)}>
                      {includeFreeCamps ? 'On' : 'Off'}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Include fuel planning</span>
                    <Button variant={includeFuelPlanning ? 'secondary' : 'outline'} size="sm" onClick={() => setIncludeFuelPlanning((value) => !value)}>
                      {includeFuelPlanning ? 'On' : 'Off'}
                    </Button>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Button className="w-full" onClick={handleRebuildPlan} disabled={routeOptionsLoading}>
                    Rebuild plan
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleFixPlan}
                    disabled={fixingPlan || routeOptionsLoading}
                  >
                    {fixingPlan ? "Fixing…" : "Fix duplicate stops"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Stop adjustments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {daySegments.map((segment, index) => {
                  const selectedOption = getSelectedOption(segment, index)
                  return (
                    <div key={`adjust-${index}`} className="rounded-3xl bg-muted/5 p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Day {index + 1}</p>
                          <p className="font-medium">{selectedOption?.location_name || `No selected stop`}</p>
                        </div>
                        {/* <div className="flex flex-wrap gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleSwapSegmentOption(segment, index)}>
                            Swap
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleRemoveSegmentSelection(segment, index)}>
                            Remove
                          </Button>
                        </div> */}
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        {selectedOption ? selectedOption.stay_type || selectedOption.route_type : 'Add an overnight stop to lock this day.'}
                      </p>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            <Card className="border">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Route health</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span>Average leg</span>
                  <span>{averageKmPerDay()} km</span>
                </div>
                <div className="flex justify-between">
                  <span>Longest leg</span>
                  <span>{Math.max(...daySegments.map((seg) => estimateSegmentDistance(seg)), 0).toFixed(2)} km</span>
                </div>
                <div className="flex justify-between">
                  <span>Fuel stations</span>
                  <span>{fuelStationCount()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Longest fuel gap</span>
                  <span>{longestFuelGapKm()} km</span>
                </div>
                <div className="flex justify-between">
                  <span>Fuel-critical days</span>
                  <span>{fuelCriticalCount()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Remote overnight areas</span>
                  <span>{remoteSectionCount()}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Warnings & notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="rounded-3xl bg-muted/5 p-3 text-sm text-muted-foreground">
                  Remote travel ahead, limited stop density north of Laura, and fuel reliance are part of this route. Booking is recommended for busy coastal and northern holiday areas.
                </div>
                <p className="text-muted-foreground">This note is separate from planning alerts and provides general route guidance for the trip.</p>
              </CardContent>
            </Card>

            {/* AI Chat Card */}
            <Card className="border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    Ask AI
                    {chatMessages.length > 0 && (
                      <span className="text-xs font-normal text-muted-foreground">{chatMessages.length} messages</span>
                    )}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {chatMessages.length > 0 && (
                  <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
                    {chatMessages.map((msg, i) => (
                      <div
                        key={msg.id ?? i}
                        className={`rounded-2xl px-3 py-2 text-sm ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground ml-4"
                            : "bg-muted/10 border border-muted/20 mr-4"
                        }`}
                      >
                        {msg.message_text}
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="bg-muted/10 border border-muted/20 rounded-2xl px-3 py-2 mr-4 flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Thinking...
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}
                {chatMessages.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Ask anything about your trip — stops, fuel, best time to drive, what to expect.
                  </p>
                )}
                {refilterBanner && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-medium text-amber-800">Stop re-filter needed</p>
                          <p className="text-amber-700 mt-0.5">
                            Your request changes{refilterBanner.preferenceHint ? ` your ${refilterBanner.preferenceHint}` : " stop preferences"}. Use <strong>Edit Trip</strong> to update preferences, then <strong>Rebuild plan</strong> and <strong>Regenerate</strong> narrative.
                          </p>
                        </div>
                      </div>
                      <button onClick={() => setRefilterBanner(null)} className="shrink-0 text-amber-600 hover:text-amber-800">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs border-amber-500/40 text-amber-800"
                        onClick={() => { router.push(`/planner/${tripId}/edit`); setRefilterBanner(null) }}
                      >
                        Edit Trip
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs text-amber-700"
                        onClick={() => setRefilterBanner(null)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                    placeholder="Ask about your route..."
                    disabled={chatLoading}
                    className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  />
                  <Button
                    size="icon"
                    onClick={handleSendMessage}
                    disabled={chatLoading || !chatInput.trim()}
                  >
                    {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
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
