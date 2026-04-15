"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { LoadScript, GoogleMap, Marker, InfoWindow, DirectionsRenderer, type Libraries } from "@react-google-maps/api"
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
  Star,
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
  end_date?: string | null
  rig_type?: string | null
  rig_length_m?: number | null
  avoid_gravel_roads?: boolean
  pet_friendly_required?: boolean
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
  isRecommended?: boolean
  isDbSource?: boolean
  distance_from_start_km?: number
  distance_to_route_km?: number
  aao_tip?: string
  why_stop_here?: string
  why_we_d_stay_again?: string
  source?: "database" | "google_places"
  is_recommended?: boolean
  road_suitability?: string
}

interface RouteSegment {
  startKm: number
  endKm: number
  verifiedStops: RouteStopOption[]
  otherStops: RouteStopOption[]
  options?: RouteStopOption[]  // 3 options with recommended flag (from API)
  recommendedOption?: RouteStopOption | null  // The recommended stop for this segment
  fuelSuggestions?: FuelStation[]
  primaryFuelSuggestion?: FuelStation
  isRemote?: boolean
  fuelCritical?: boolean
  degradedMode?: boolean
  fuelDistanceIntoLegKm?: number
  gapFromLastFuelKm?: number
  gapToNextFuelKm?: number
  fuelWarning?: string
  // Anchor: the primary overnight stop chosen by the planner for this segment.
  // Used to chain consecutive days: anchorName of day N becomes fromLocation of day N+1.
  overnightAnchorName?: string | null
  overnightAnchorLat?: number | null
  overnightAnchorLng?: number | null
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
  onRemove,
}: {
  stop: RouteStopOption
  onRemove?: () => void
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
        {onRemove && (
          <div className="mt-2">
            <button
              type="button"
              onClick={onRemove}
              className="text-xs text-muted-foreground hover:text-destructive font-medium transition-colors"
            >
              Remove from this day
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function StaticRouteStopItem({
  stop,
  onRemove,
}: {
  stop: RouteStopOption
  onRemove?: () => void
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
        {onRemove && (
          <div className="mt-2">
            <button
              type="button"
              onClick={onRemove}
              className="text-xs text-muted-foreground hover:text-destructive font-medium transition-colors"
            >
              Remove from this day
            </button>
          </div>
        )}
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
  const [hoveredPin, setHoveredPin] = useState<{ lat: number; lng: number; label: string; distanceFromRoute?: number; sourceType?: "verified" | "custom" } | null>(null)
  const [focusedFuelStation, setFocusedFuelStation] = useState<{ lat: number; lng: number; name: string } | null>(null)
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

    // When we have fewer segments than days, do NOT pad with phantom zero-distance
    // segments. Instead return the actual segments — they cover the real route.
    // Phantom days caused empty day cards with no stops and 0 km distances.
    if (segments.length < targetDays) {
      return segments
    }

    // More segments than days: merge by grouping consecutive segments into buckets.
    // Each bucket keeps only the overnight anchor of the last segment in the group
    // so stops don't bleed across a wide km range into a single day card.
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
          options: [],
          recommendedOption: null,
          fuelSuggestions: [],
          primaryFuelSuggestion: undefined,
          isRemote: false,
          fuelCritical: false,
          degradedMode: false,
          fuelDistanceIntoLegKm: undefined,
          gapFromLastFuelKm: undefined,
          gapToNextFuelKm: undefined,
          fuelWarning: undefined,
          overnightAnchorName: null,
          overnightAnchorLat: null,
          overnightAnchorLng: null,
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

      const allOptions: RouteStopOption[] = []
      group.forEach((seg) => {
        if (seg.options) {
          seg.options.forEach((opt) => {
            if (!allOptions.some((a) => a.id === opt.id)) {
              allOptions.push(opt)
            }
          })
        }
      })
      const recommendedOption = group.find((seg) => seg.recommendedOption)?.recommendedOption ?? null

      return {
        startKm: first.startKm,
        endKm: last.endKm,
        verifiedStops: Array.from(verifiedStopsMap.values()),
        otherStops: Array.from(otherStopsMap.values()),
        options: allOptions.length > 0 ? allOptions : undefined,
        recommendedOption,
        fuelSuggestions,
        primaryFuelSuggestion: fuelSuggestions[0],
        isRemote: group.some((s) => s.isRemote),
        fuelCritical: group.some((s) => s.fuelCritical),
        degradedMode: group.some((s) => s.degradedMode),
        fuelDistanceIntoLegKm: group.find((s) => s.fuelDistanceIntoLegKm !== undefined)?.fuelDistanceIntoLegKm,
        gapFromLastFuelKm: group.find((s) => s.gapFromLastFuelKm !== undefined)?.gapFromLastFuelKm,
        gapToNextFuelKm: group.find((s) => s.gapToNextFuelKm !== undefined)?.gapToNextFuelKm,
        fuelWarning: group.find((s) => s.fuelWarning)?.fuelWarning,
        overnightAnchorName: last.overnightAnchorName ?? null,
        overnightAnchorLat: last.overnightAnchorLat ?? null,
        overnightAnchorLng: last.overnightAnchorLng ?? null,
      }
    })
  }

  // Use the user's explicitly requested day count. Do not auto-reduce from driving
  // pace — that caused a 14-day trip to display as 12 days, dropping the last days.
  const targetDays = Math.max(1, Number(trip?.trip_duration_days || 1))

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
            verifiedStops: [] as RouteStopOption[],
            otherStops: [] as RouteStopOption[],
            options: [] as RouteStopOption[],
            recommendedOption: null as RouteStopOption | null,
            fuelSuggestions: [] as FuelStation[],
            primaryFuelSuggestion: undefined,
            isRemote: false,
            fuelCritical: false,
            degradedMode: false,
            fuelDistanceIntoLegKm: undefined,
            gapFromLastFuelKm: undefined,
            gapToNextFuelKm: undefined,
            fuelWarning: undefined,
            overnightAnchorName: null as string | null,
            overnightAnchorLat: null as number | null,
            overnightAnchorLng: null as number | null,
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

    // Priority order for the nearby search centre:
    // 1. The explicitly selected overnight stop for this day
    // 2. The server-computed overnight anchor for this segment
    // 3. Any stop within the segment (midpoint of the list)
    // We do NOT fall back to straight-line trip interpolation — for coastal routes
    // that produces ocean coordinates far from the actual highway.
    let midLat: number = NaN
    let midLng: number = NaN

    // 1. Explicitly selected stop
    const selected = segment ? getSelectedOption(segment, dayIndex) : null
    const selLat = selected ? parseFloat(selected.latitude ?? "0") : NaN
    const selLng = selected ? parseFloat(selected.longitude ?? "0") : NaN
    if (isValidLatLng(selLat, selLng)) {
      midLat = selLat
      midLng = selLng
    }

    // 2. Server-computed anchor (already on the actual road polyline)
    if (!isValidLatLng(midLat, midLng) && segment?.overnightAnchorLat && segment?.overnightAnchorLng) {
      if (isValidLatLng(segment.overnightAnchorLat, segment.overnightAnchorLng)) {
        midLat = segment.overnightAnchorLat
        midLng = segment.overnightAnchorLng
      }
    }

    // 3. Mid-stop from segment stop list
    if (!isValidLatLng(midLat, midLng) && segment) {
      const segmentStops = [...segment.verifiedStops, ...segment.otherStops]
      const midStop = segmentStops.length > 0
        ? segmentStops[Math.floor(segmentStops.length / 2)]
        : null
      const stopLat = midStop ? parseFloat(midStop.latitude ?? "0") : NaN
      const stopLng = midStop ? parseFloat(midStop.longitude ?? "0") : NaN
      if (isValidLatLng(stopLat, stopLng)) {
        midLat = stopLat
        midLng = stopLng
      }
    }

    // If still no valid point, skip the search — searching from 0,0 or an ocean
    // coordinate will only return irrelevant or offshore results.
    if (!isValidLatLng(midLat, midLng)) {
      setLoadingPlaces((prev) => { const next = new Set(prev); next.delete(dayIndex); return next })
      return
    }

    if (isValidLatLng(midLat, midLng)) {
      try {
        const response = await fetch(
          `/api/places/nearby?lat=${midLat}&lng=${midLng}&radius=${process.env.NEXT_PUBLIC_PLANNER_NEARBY_RADIUS ?? 35000}&types=campground,rv_park,gas_station`
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
    
    // Recalculate route to include selected stops as waypoints
    if (map) {
      calculateRoute(map)
    }
    
    toast.success(`${option.location_name} selected for this stop.`)
    
    // Recalculate route with waypoints through selected stops
    if (map) {
      await calculateRouteWithWaypoints(map)
    }
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

  const handleGenerateNarrative = async () => {
    if (!trip || !userId) return
    setNarrativeLoading(true)
    try {
      // Build a stable chain of overnight locations before generating the narrative.
      // Priority: explicitly selected option → server-computed anchor → null.
      // Each day's toLocation becomes the next day's fromLocation, enforcing continuity.
      const resolvedChain: Array<string | null> = daySegments.map((segment, index) => {
        if (index === daySegments.length - 1) return trip.destination_text
        return (
          getSelectedOption(segment, index)?.location_name ??
          segment.overnightAnchorName ??
          null
        )
      })

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

        // fromLocation: trip start for day 1, previous day's committed overnight for all others
        const fromLocation = index === 0
          ? trip.start_location_text
          : (resolvedChain[index - 1] ?? null)

        // toLocation: trip destination for last day, this day's committed overnight for all others
        const toLocation = resolvedChain[index]

        return {
          dayNumber: index + 1,
          fromLocation,
          toLocation,
          distanceKm: estimateSegmentDistance(segment, index),
          driveTimeMinutes: estimateSegmentDuration(segment, index),
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

      // Derive travel month for seasonal notes (Gap 9)
      let travelMonth: string | null = null
      if (trip.end_date) {
        const halfMs = ((trip.trip_duration_days || 1) / 2) * 24 * 60 * 60 * 1000
        const midpoint = new Date(new Date(trip.end_date).getTime() - halfMs)
        travelMonth = midpoint.toLocaleString("en-AU", { month: "long" })
      }

      // Derive road conditions from segments (Gap 9)
      const hasGravelSegments = daySegments.some((s) =>
        s.verifiedStops.some((v) => v.road_suitability?.toLowerCase() === "gravel" || v.road_suitability?.toLowerCase() === "4wd") ||
        s.otherStops.some((v) => v.road_suitability?.toLowerCase() === "gravel" || v.road_suitability?.toLowerCase() === "4wd")
      )
      const roadConditionNote = hasGravelSegments
        ? "Some overnight stop options on this route require gravel or 4WD access. Verify road conditions before committing to each leg."
        : null

      const response = await fetch(`/api/trips/${tripId}/narrative`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          trip: {
            title: trip.title,
            travel_pace: trip.travel_pace,
            trip_duration_days: trip.trip_duration_days,
            rig_type: trip.rig_type ?? null,
            rig_length_m: trip.rig_length_m ?? null,
            avoid_gravel_roads: trip.avoid_gravel_roads ?? false,
            pet_friendly_required: trip.pet_friendly_required ?? false,
          },
          corridor: routeMeta.corridor,
          totalDistanceKm: routeMeta.drivingInfo?.totalDistanceKm,
          fuelSummary,
          days: daysPayload,
          // Enrichment data for Gap 9
          travelMonth,
          roadConditionNote,
        }),
      })
      const result = await response.json()
      if (result.success) {
        setTripNarrative(result.narrative)
        toast.success("TrackMate Overview generated and saved")
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
      // Persist segment selections + computed segments alongside the narrative so they survive page reload (§7.9)
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
            // Persist the computed segments so stop options survive page reload without re-fetching
            savedSegments: routeMeta.segments ?? null,
            savedRouteMeta: {
              corridor: routeMeta.corridor,
              drivingInfo: routeMeta.drivingInfo,
              paceConfig: routeMeta.paceConfig,
              fuelStations: routeMeta.fuelStations,
              planningMode: routeMeta.planningMode,
            },
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
        
        // Recalculate route after removing stop
        if (map) {
          calculateRoute(map)
        }
        
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

  const calculateRoute = useCallback(async (mapInstance: google.maps.Map) => {
    if (!trip) return

    const origin = new google.maps.LatLng(trip.start_lat!, trip.start_lng!)
    const destination = new google.maps.LatLng(trip.destination_lat!, trip.destination_lng!)

    const directionsService = new google.maps.DirectionsService()

    // Draw the direct A→B corridor only. Stops are rendered as numbered markers
    // separately. Including stops as waypoints caused the route to detour to each
    // campsite, creating a second visible branch whenever an option was selected.
    directionsService.route(
      {
        origin: origin,
        destination: destination,
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
  }, [trip])

  const calculateRouteWithWaypoints = useCallback(async (mapInstance: google.maps.Map) => {
    if (!trip || !daySegments.length) return

    const origin = new google.maps.LatLng(trip.start_lat!, trip.start_lng!)
    const destination = new google.maps.LatLng(trip.destination_lat!, trip.destination_lng!)

    // Compute selected stops from segments and user selections.
    // Seed usedIds with excludedOptionIds so excluded stops are never used as waypoints.
    const usedIds = new Set<string>(excludedOptionIds)
    const selectedStops: RouteStopOption[] = daySegments.map((seg, i) => {
      // Skip arrival day — no waypoint needed for the short final leg
      if (i === arrivalDayIndex) return null

      // Use segment.options[] first (pre-scoped by API, no cross-day bleeding)
      const allOptions = seg.options && seg.options.length > 0
        ? seg.options
        : [...seg.verifiedStops, ...seg.otherStops]
      // Filter out already-used AND explicitly excluded stops
      const visible = allOptions.filter((o) => !usedIds.has(o.id) && !excludedOptionIds.has(o.id))
      const explicitId = selectedSegmentOptionIds[i]
      if (explicitId) {
        const explicit = visible.find((o) => o.id === explicitId)
        if (explicit) { usedIds.add(explicit.id); return explicit }
      }
      // Prefer recommendedOption from API first
      if (seg.recommendedOption && !usedIds.has(seg.recommendedOption.id) && !excludedOptionIds.has(seg.recommendedOption.id)) {
        usedIds.add(seg.recommendedOption.id)
        return seg.recommendedOption
      }
      const pick = visible.find((o) => !usedIds.has(o.id)) ?? null
      if (pick) usedIds.add(pick.id)
      return pick
    }).filter((stop): stop is RouteStopOption => stop !== null)

    // Google Directions API supports max 25 waypoints. For longer trips, keep
    // only evenly-spaced stops so the route still represents the full journey.
    const MAX_WAYPOINTS = 25
    const cappedStops = selectedStops.length > MAX_WAYPOINTS
      ? (() => {
          const step = selectedStops.length / MAX_WAYPOINTS
          return Array.from({ length: MAX_WAYPOINTS }, (_, i) =>
            selectedStops[Math.min(Math.round(i * step), selectedStops.length - 1)]
          )
        })()
      : selectedStops

    // Build waypoints from selected stops
    const waypoints: google.maps.DirectionsWaypoint[] = cappedStops
      .map((stop) => ({
        location: new google.maps.LatLng(
          parseFloat(stop.latitude || "0"),
          parseFloat(stop.longitude || "0")
        ),
        stopover: true,
      }))

    const directionsService = new google.maps.DirectionsService()

    directionsService.route(
      {
        origin: origin,
        destination: destination,
        waypoints: waypoints.length > 0 ? waypoints : undefined,
        travelMode: google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      },
      (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          setDirections(result)
          if (directionsRendererRef.current) {
            directionsRendererRef.current.setDirections(result)
          }
        } else {
          console.error("Directions request with waypoints failed:", status)
          directionsService.route(
            {
              origin: origin,
              destination: destination,
              travelMode: google.maps.TravelMode.DRIVING,
            },
            (fallbackResult, fallbackStatus) => {
              if (fallbackStatus === google.maps.DirectionsStatus.OK && fallbackResult) {
                setDirections(fallbackResult)
              }
            }
          )
        }
      }
    )
  }, [trip, daySegments, selectedSegmentOptionIds, excludedOptionIds])

  useEffect(() => {
    if (map && trip) {
      calculateRoute(map)
    }
  }, [map, trip, calculateRoute])

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

  const calculateDistanceToLine = (pointLat: number, pointLng: number, lineStartLat: number, lineStartLng: number, lineEndLat: number, lineEndLng: number) => {
    const startToEndDist = haversineKm(lineStartLat, lineStartLng, lineEndLat, lineEndLng)
    if (startToEndDist < 0.01) return haversineKm(pointLat, pointLng, lineStartLat, lineStartLng)
    
    const t = Math.max(0, Math.min(1, (
      (pointLat - lineStartLat) * (lineEndLat - lineStartLat) +
      (pointLng - lineStartLng) * (lineEndLng - lineStartLng)
    ) / (startToEndDist * startToEndDist * 6371 * 6371)))
    
    const projLat = lineStartLat + t * (lineEndLat - lineStartLat)
    const projLng = lineStartLng + t * (lineEndLng - lineStartLng)
    return haversineKm(pointLat, pointLng, projLat, projLng)
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

  const estimateSegmentDistance = (segment: RouteSegment, index?: number) => {
    if (typeof index === 'number') {
      // Arrival day: no overnight stop, drive from previous stop to destination
      if (index === arrivalDayIndex) {
        const prevStop = index > 0 ? resolvedDaySelections[index - 1] : null
        const prevKm = prevStop?.distance_from_start_km != null
          ? Number(prevStop.distance_from_start_km)
          : segment.startKm
        if (Number.isFinite(prevKm) && totalRouteDistanceKm > 0) {
          return Math.max(0, totalRouteDistanceKm - prevKm)
        }
      }

      const currentStop = resolvedDaySelections[index]
      const prevStop = index > 0 ? resolvedDaySelections[index - 1] : null

      const endKm = currentStop?.distance_from_start_km != null
        ? Number(currentStop.distance_from_start_km)
        : NaN
      const startKm = index === 0
        ? 0
        : prevStop?.distance_from_start_km != null
          ? Number(prevStop.distance_from_start_km)
          : NaN

      if (Number.isFinite(endKm) && Number.isFinite(startKm)) {
        return Math.max(0, endKm - startKm)
      }
    }

    return Math.max(0, segment.endKm - segment.startKm)
  }

  const estimateSegmentDuration = (segment: RouteSegment, index?: number) => {
    const dist = estimateSegmentDistance(segment, index)

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
    // Use the chained anchor names for accurate from→to labels.
    // Day N's "from" is Day N-1's anchor; Day N's "to" is this day's anchor.
    const prevAnchor = index === 0
      ? (trip?.start_location_text ?? "Start")
      : (daySegments[index - 1]?.overnightAnchorName ??
         getSelectedOption(daySegments[index - 1], index - 1)?.location_name ??
         `Day ${index}`)

    const thisAnchor = index === daySegments.length - 1
      ? (trip?.destination_text ?? "Destination")
      : (segment.overnightAnchorName ??
         getSelectedOption(segment, index)?.location_name ??
         `Day ${index + 1} stop`)

    return `${prevAnchor} → ${thisAnchor}`
  }

  const filterStopsBySegmentDistance = useCallback((segment: RouteSegment, options: RouteStopOption[]) => {
    if (options.length === 0) return options

    const optionsWithDistance = options.filter((option) =>
      typeof option.distance_from_start_km === "number" && Number.isFinite(option.distance_from_start_km)
    )

    if (optionsWithDistance.length === 0) return options

    const midpoint = (segment.startKm + segment.endKm) / 2
    // Trust the API's stop scoping — no extra frontend padding to prevent cross-day bleeding.
    const paddingKm = 0
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

  // Index of the last segment if it is a short "arrival day" (< 40 km or < 20% avg).
  // Declared before resolvedDaySelections so it can be used as a stable memo dep.
  const arrivalDayIndex = useMemo(() => {
    if (daySegments.length === 0) return -1
    const lastIdx = daySegments.length - 1
    const seg = daySegments[lastIdx]
    const legKm = seg.endKm - seg.startKm
    const totalKm = daySegments.reduce((sum, s) => sum + Math.max(0, s.endKm - s.startKm), 0)
    const avgKm = daySegments.length > 0 ? totalKm / daySegments.length : 200
    return legKm < 40 || legKm < avgKm * 0.20 ? lastIdx : -1
  }, [daySegments])

  // Pre-compute each day's selection sequentially — single source of truth for dedup
  const resolvedDaySelections = useMemo(() => {
    const usedIds = new Set<string>(excludedOptionIds)
    return daySegments.map((seg, i) => {
      // Arrival day: last segment that is too short to need an overnight stop
      if (i === arrivalDayIndex) return null

      // Prefer segment.options[] from API (already scoped per segment, no bleed)
      const allOptions = seg.options && seg.options.length > 0
        ? seg.options
        : filterStopsBySegmentDistance(seg, [...seg.verifiedStops, ...seg.otherStops])
      const visible = allOptions.filter((o) => !excludedOptionIds.has(o.id))
      const explicitId = selectedSegmentOptionIds[i]
      if (explicitId) {
        const explicit = visible.find((o) => o.id === explicitId)
        if (explicit) { usedIds.add(explicit.id); return explicit }
      }
      // Prefer recommendedOption from API first
      if (seg.recommendedOption && !usedIds.has(seg.recommendedOption.id) && !excludedOptionIds.has(seg.recommendedOption.id)) {
        usedIds.add(seg.recommendedOption.id)
        return seg.recommendedOption
      }
      const pick = visible.find((o) => !usedIds.has(o.id)) ?? null
      if (pick) usedIds.add(pick.id)
      return pick
    })
  }, [daySegments, arrivalDayIndex, selectedSegmentOptionIds, excludedOptionIds, filterStopsBySegmentDistance])

  const getSelectedOption = (segment: RouteSegment, segmentIndex?: number) => {
    if (segmentIndex !== undefined) {
      const resolved = resolvedDaySelections[segmentIndex]
      return resolved ?? undefined
    }
    // Fallback path (no segmentIndex): prefer recommendedOption for consistency
    if (segment.recommendedOption && !excludedOptionIds.has(segment.recommendedOption.id)) {
      return segment.recommendedOption
    }
    const allOptions = filterStopsBySegmentDistance(segment, [...segment.verifiedStops, ...segment.otherStops])
    return allOptions.filter((o) => !excludedOptionIds.has(o.id))[0]
  }

  const getSegmentOptions = (segment: RouteSegment, maxOptions = 3) => {
    if (segment.options && segment.options.length > 0) {
      return segment.options.slice(0, maxOptions)
    }
    const allOptions = [...segment.verifiedStops, ...segment.otherStops]
    return filterStopsBySegmentDistance(segment, allOptions).slice(0, maxOptions)
  }

  const averageKmPerDay = () => {
    const totalKm = routeMeta.drivingInfo?.totalDistanceKm
    const days = computeEstimatedDays()
    return totalKm && days ? Math.round(totalKm / days) : 0
  }

  const isArrivalDaySegment = (segIndex: number) => segIndex === arrivalDayIndex

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

    // Each segment carries its own pre-assigned fuel suggestions from the server.
    // Never fall back to the global fuelStations list — that caused the same station
    // to repeat across multiple day cards via modular rotation.
    if (!segment.fuelSuggestions || segment.fuelSuggestions.length === 0) return []

    const withDistance = segment.fuelSuggestions.filter(
      (s) => typeof s.distanceFromStartKm === "number" && Number.isFinite(s.distanceFromStartKm)
    )

    // If all suggestions have distance data, show only those within this segment's km range.
    if (withDistance.length > 0) {
      const segmentPaddingKm = 30
      const inRange = withDistance
        .filter((s) => {
          const d = s.distanceFromStartKm as number
          return d >= segment.startKm - segmentPaddingKm && d <= segment.endKm + segmentPaddingKm
        })
        .sort((a, b) => (a.distanceFromStartKm as number) - (b.distanceFromStartKm as number))
      return inRange.length > 0 ? inRange.slice(0, 3) : withDistance.slice(0, 3)
    }

    // No distance data — return the suggestions as-is (already segment-specific from server)
    return segment.fuelSuggestions.slice(0, 3)
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
    if (routeMeta.segments && routeMeta.segments.length > 0 && map) {
      calculateRouteWithWaypoints(map)
    }
  }, [routeMeta.segments, map, calculateRouteWithWaypoints])

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
          // Guard: trip is still being generated — redirect back to the list
          if (data.trip.status === "in_progress") {
            router.replace("/planner")
            return
          }

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
          // Restore computed segments + route meta so stop options are immediately available without re-fetching
          if (routeJson.savedSegments && Array.isArray(routeJson.savedSegments) && (routeJson.savedSegments as unknown[]).length > 0) {
            const savedMeta = (routeJson.savedRouteMeta ?? {}) as Partial<RouteMeta>
            setRouteMeta({
              corridor: savedMeta.corridor,
              drivingInfo: savedMeta.drivingInfo,
              paceConfig: savedMeta.paceConfig,
              fuelStations: savedMeta.fuelStations,
              planningMode: savedMeta.planningMode,
              segments: routeJson.savedSegments as RouteSegment[],
            })
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

        // Sort stops in route-following order using the actual A→B road polyline.
        // Haversine (straight-line) sort causes wrong pin order for curved routes
        // (e.g. Brisbane→Darwin pins jumping to offshore or PNG locations).
        const tripForSort = data.trip as { start_lat?: number; start_lng?: number; destination_lat?: number; destination_lng?: number } | null
        if (tripForSort?.start_lat && tripForSort?.start_lng && tripForSort?.destination_lat && tripForSort?.destination_lng && formattedStops.length > 0) {
          try {
            const sortResponse = await fetch("/api/stops/sort", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                stops: formattedStops.map((s) => ({
                  id: s.id,
                  latitude: s.latitude,
                  longitude: s.longitude,
                  location_name: s.location_name,
                })),
                origin: { lat: tripForSort.start_lat, lng: tripForSort.start_lng },
                destination: { lat: tripForSort.destination_lat, lng: tripForSort.destination_lng },
                // No waypoints — the sort API will fetch the A→B polyline and project stops onto it.
                minSpacingKm: 0,
              }),
            })
            const sortData = await sortResponse.json()
            if (sortData.success && sortData.sortedStops?.length > 0) {
              const orderMap = new Map<string, number>()
              const distFromRouteMap = new Map<string, number>()
              sortData.sortedStops.forEach((s: { id: string; order: number; distanceFromRoute?: number }) => {
                orderMap.set(s.id, s.order)
                if (s.distanceFromRoute !== undefined) distFromRouteMap.set(s.id, s.distanceFromRoute)
              })

              // Remove stops that are more than 100 km off the actual road polyline.
              // This cleans up trips created before the server-side filters were tightened
              // (e.g. Flinders Ranges stops appearing for a Port Augusta → Coober Pedy trip).
              if (distFromRouteMap.size > 0) {
                formattedStops = formattedStops.filter((s) => {
                  const d = distFromRouteMap.get(s.id)
                  return d === undefined || d <= 100
                })
              }

              formattedStops.sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999))
            }
          } catch (sortErr) {
            console.error("Stop sort failed, keeping DB order:", sortErr)
          }
        }

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

  const isNearEndpointMarker = useCallback((lat: number, lng: number) => {
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
  }, [trip])

  const stopOrderByNormalizedId = useMemo(() => {
    const order = new Map<string, number>()
    stops.forEach((stop, idx) => {
      order.set(normalizeStopId(stop.stop_id || stop.id), idx)
    })
    return order
  }, [stops])

  const stopBelongsToDay = (stop: TripStop, segment: RouteSegment, dayIndex: number) => {
    if (effectiveDayCount === 1) return true

    if (typeof stop.day_index === "number" && Number.isFinite(stop.day_index)) {
      const normalizedDayIndex = Math.trunc(stop.day_index)
      if (normalizedDayIndex >= 0 && normalizedDayIndex < effectiveDayCount) {
        return normalizedDayIndex === dayIndex
      }
    }

    const stopDistance = Number(stop.distance_from_start_km)
    if (Number.isFinite(stopDistance)) {
      const isLastDay = dayIndex === effectiveDayCount - 1
      return stopDistance >= segment.startKm && (isLastDay ? stopDistance <= segment.endKm : stopDistance < segment.endKm)
    }

    const normalizedId = normalizeStopId(stop.stop_id || stop.id)
    const orderIndex = stopOrderByNormalizedId.get(normalizedId)
    if (orderIndex === undefined) return dayIndex === 0

    if (stops.length <= 1) return dayIndex === 0
    const ratio = orderIndex / Math.max(1, stops.length - 1)
    const approxDay = Math.min(effectiveDayCount - 1, Math.floor(ratio * effectiveDayCount))
    return approxDay === dayIndex
  }

  const unifiedDayRouteData = (() => {
    const initialDayRouteData = daySegments.map((segment, index) => {
    const previousSelectedOption = index > 0 ? resolvedDaySelections[index - 1] : null
    const selectedOption = resolvedDaySelections[index]
    const nextSelectedOption = index < daySegments.length - 1 ? resolvedDaySelections[index + 1] : null

    const allStops = filterStopsBySegmentDistance(segment, [...segment.verifiedStops, ...segment.otherStops])

    const persistedTripStopsForSegment: RouteStopOption[] = stops
      .filter((stop) => stop.verification_status !== "custom")
      .filter((stop) => stopBelongsToDay(stop, segment, index))
      .map((stop) => ({
        id: normalizeStopId(stop.stop_id || stop.id),
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
        is_verified: true,
        distance_from_start_km: Number.isFinite(Number(stop.distance_from_start_km))
          ? Number(stop.distance_from_start_km)
          : undefined,
        distance_to_route_km: Number.isFinite(Number(stop.distance_to_route_km))
          ? Number(stop.distance_to_route_km)
          : undefined,
      }))

    const persistedStopsForSegment = Array.from(
      new Map(persistedTripStopsForSegment.map((stop) => [normalizeStopId(stop.id), stop])).values()
    )

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

    const routeStops = getOrderedRouteStops(index, persistedStopsForSegment)
    const routeStopIds = new Set(routeStops.map((stop) => normalizeStopId(stop.id)).filter(Boolean))

    const hiddenCustomKeysForDay = new Set(hiddenCustomStopsByDay[index] || [])
    const customStopsForDay = stops.filter((stop) => {
      if (stop.verification_status !== "custom") return false
      if (!stopBelongsToDay(stop, segment, index)) return false

      const normalizedId = normalizeStopId(stop.stop_id || stop.id)
      const displayKey = getCustomStopDisplayKey(stop)

      return !routeStopIds.has(normalizedId)
        && !hiddenCustomKeysForDay.has(displayKey)
    })

    const seenCustomStopKeys = new Set<string>()
    const dedupedCustomStopsForDay = customStopsForDay.filter((stop) => {
      const key = getCustomStopDisplayKey(stop)

      if (seenCustomStopKeys.has(key)) return false
      seenCustomStopKeys.add(key)
      return true
    })

    const sortedCustomStopsForDay = [...dedupedCustomStopsForDay].sort(
      (a, b) => (a.distance_from_start_km ?? 999999) - (b.distance_from_start_km ?? 999999)
    )

      return {
        allStops,
        endpointStopIds,
        endpointStopNames,
        routeStops,
        routeStopIds,
        customStopsForDay: sortedCustomStopsForDay,
        dayShownStopCount: routeStops.length + sortedCustomStopsForDay.length,
      }
    })

    const rebalancedDayRouteData = initialDayRouteData.map((day) => ({
      ...day,
      customStopsForDay: [...day.customStopsForDay],
    }))

    // Rebalance overloaded custom-stop days into adjacent empty days.
    for (let dayIndex = 0; dayIndex < rebalancedDayRouteData.length - 1; dayIndex += 1) {
      const currentDay = rebalancedDayRouteData[dayIndex]
      const nextDay = rebalancedDayRouteData[dayIndex + 1]

      const currentShown = currentDay.routeStops.length + currentDay.customStopsForDay.length
      const nextShown = nextDay.routeStops.length + nextDay.customStopsForDay.length

      if (nextShown > 0) continue
      if (currentShown <= 1) continue
      if (currentDay.customStopsForDay.length === 0) continue

      const movedStop = currentDay.customStopsForDay.pop()
      if (!movedStop) continue

      nextDay.customStopsForDay.unshift(movedStop)
    }

    // Second pass: fill remaining empty days from the nearest donor day with >1 custom stop.
    for (let dayIndex = 0; dayIndex < rebalancedDayRouteData.length; dayIndex += 1) {
      const targetDay = rebalancedDayRouteData[dayIndex]
      const targetShown = targetDay.routeStops.length + targetDay.customStopsForDay.length
      if (targetShown > 0) continue

      let donorIndex = -1
      let donorDistance = Number.MAX_SAFE_INTEGER

      for (let candidateIndex = 0; candidateIndex < rebalancedDayRouteData.length; candidateIndex += 1) {
        if (candidateIndex === dayIndex) continue
        const candidateDay = rebalancedDayRouteData[candidateIndex]
        if (candidateDay.customStopsForDay.length <= 1) continue

        const distance = Math.abs(candidateIndex - dayIndex)
        if (distance < donorDistance) {
          donorDistance = distance
          donorIndex = candidateIndex
        }
      }

      if (donorIndex === -1) continue

      const donorDay = rebalancedDayRouteData[donorIndex]
      const movedStop = donorDay.customStopsForDay.pop()
      if (!movedStop) continue

      targetDay.customStopsForDay.push(movedStop)
    }

    return rebalancedDayRouteData.map((day) => {
      const sortedCustomStopsForDay = [...day.customStopsForDay].sort(
        (a, b) => (a.distance_from_start_km ?? 999999) - (b.distance_from_start_km ?? 999999)
      )

      return {
        ...day,
        customStopsForDay: sortedCustomStopsForDay,
        dayShownStopCount: day.routeStops.length + sortedCustomStopsForDay.length,
      }
    })
  })()

  const unifiedOrderedMapStops = unifiedDayRouteData.flatMap((dayData, dayIndex) => ([
    ...dayData.routeStops.map((stop) => ({
      key: `verified-${dayIndex}-${stop.id}`,
      location_name: stop.location_name,
      latitude: stop.latitude,
      longitude: stop.longitude,
      sourceType: "verified" as const,
      distance_to_route_km: stop.distance_to_route_km,
    })),
    ...dayData.customStopsForDay.map((stop) => ({
      key: `custom-${dayIndex}-${stop.id}`,
      location_name: stop.location_name,
      latitude: stop.latitude,
      longitude: stop.longitude,
      sourceType: "custom" as const,
      distance_to_route_km: stop.distance_to_route_km,
    })),
  ]))

  const fallbackMapStopsFromPersisted = stops.map((stop, index) => {
    const isCustom = stop.verification_status === "custom"
    let distFromRoute = stop.distance_to_route_km
    
    if (isCustom && (distFromRoute === undefined || distFromRoute === null) && trip) {
      const stopLat = parseFloat(String(stop.latitude || "0"))
      const stopLng = parseFloat(String(stop.longitude || "0"))
      const startLat = parseFloat(String(trip.start_lat || "0"))
      const startLng = parseFloat(String(trip.start_lng || "0"))
      const destLat = parseFloat(String(trip.destination_lat || "0"))
      const destLng = parseFloat(String(trip.destination_lng || "0"))
      
      if (!isNaN(stopLat) && !isNaN(stopLng) && !isNaN(startLat) && !isNaN(destLat)) {
        distFromRoute = calculateDistanceToLine(stopLat, stopLng, startLat, startLng, destLat, destLng)
      }
    }
    
    return {
      key: `persisted-${index}-${normalizeStopId(stop.stop_id || stop.id) || stop.id}`,
      location_name: stop.location_name,
      latitude: stop.latitude,
      longitude: stop.longitude,
      sourceType: (stop.verification_status === "custom" ? "custom" : "verified") as "verified" | "custom",
      distance_to_route_km: distFromRoute,
    }
  })

  const effectiveMapStops =
    fallbackMapStopsFromPersisted.length > unifiedOrderedMapStops.length
      ? fallbackMapStopsFromPersisted
      : unifiedOrderedMapStops

  // Only show recommended stops (one per day) on the map, not all stops
  const recommendedMapStops = useMemo(() => {
    if (!daySegments || daySegments.length === 0) return []
    return daySegments
      .map((segment, index) => {
        // Skip arrival day — it has no overnight stop
        if (index === arrivalDayIndex) return null
        // Prioritise user's explicit selection; fall back to API recommended
        const resolved = index < resolvedDaySelections.length ? resolvedDaySelections[index] : null
        const seg = segment as RouteSegment | undefined
        const recommended = resolved || seg?.recommendedOption || getSelectedOption(segment, index)
        if (!recommended) return null
        const lat = parseFloat(String(recommended.latitude ?? ""))
        const lng = parseFloat(String(recommended.longitude ?? ""))
        if (isNaN(lat) || isNaN(lng)) return null
        return {
          key: `rec-stop-${index}`,
          id: recommended.id,
          location_name: recommended.location_name,
          latitude: lat,
          longitude: lng,
          state: recommended.state,
          region: recommended.region,
          route_type: recommended.route_type,
          stay_type: recommended.stay_type,
          is_verified: recommended.is_verified ?? false,
          sourceType: recommended.is_verified ? "verified" : "custom",
          distance_to_route_km: recommended.distance_to_route_km,
        }
      })
      .filter((stop): stop is NonNullable<typeof stop> => stop !== null)
  }, [daySegments, arrivalDayIndex, resolvedDaySelections, getSelectedOption])


  useEffect(() => {
    if (loading) return

    const savedStops = stops.filter((stop) => stop.verification_status !== "custom")
    const customStops = stops.filter((stop) => stop.verification_status === "custom")

    console.log("[PlannerDebug] saved stops", {
      count: savedStops.length,
      ids: savedStops.map((stop) => normalizeStopId(stop.stop_id || stop.id)),
      names: savedStops.map((stop) => stop.location_name),
    })

    console.log("[PlannerDebug] custom stops", {
      count: customStops.length,
      ids: customStops.map((stop) => normalizeStopId(stop.stop_id || stop.id)),
      names: customStops.map((stop) => stop.location_name),
      dayIndexes: customStops.map((stop) => stop.day_index ?? null),
    })

    console.log("[PlannerDebug] central combined source", {
      unifiedCount: unifiedOrderedMapStops.length,
      persistedFallbackCount: fallbackMapStopsFromPersisted.length,
      effectiveCount: effectiveMapStops.length,
      effectiveNames: effectiveMapStops.map((stop) => stop.location_name),
      perDay: unifiedDayRouteData.map((day, idx) => ({
        day: idx + 1,
        routeCount: day.routeStops.length,
        customCount: day.customStopsForDay.length,
        routeNames: day.routeStops.map((stop) => stop.location_name),
        customNames: day.customStopsForDay.map((stop) => stop.location_name),
      })),
      planningAlerts: routeWarnings,
    })
  }, [
    loading,
    stops,
    unifiedDayRouteData,
    unifiedOrderedMapStops,
    fallbackMapStopsFromPersisted,
    effectiveMapStops,
    routeWarnings,
  ])

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
                {narrativeLoading ? "Generating..." : tripNarrative ? "Regenerate" : "TrackMate Overview"}
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
                        onMouseOver={() => setHoveredPin({ lat: trip.start_lat!, lng: trip.start_lng!, label: trip.start_location_text ?? "Start" })}
                        onMouseOut={() => setHoveredPin(null)}
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
                        onMouseOver={() => setHoveredPin({ lat: trip.destination_lat!, lng: trip.destination_lng!, label: trip.destination_text ?? "Destination" })}
                        onMouseOut={() => setHoveredPin(null)}
                      />
                    )}

                    {recommendedMapStops.map((stop, index) => {
                      const lat = parseFloat(String(stop.latitude ?? ""))
                      const lng = parseFloat(String(stop.longitude ?? ""))
                      if (isNaN(lat) || isNaN(lng)) return null
                      const isVerified = stop.sourceType === "verified"
                      const markerColor = isVerified ? "#22c55e" : "#ef4444"
                      const svgUrl = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8" fill="' + markerColor + '" stroke="#ffffff" strokeWidth="2"/></svg>')
                      return (
                        <Marker
                          key={`segment-stop-${stop.key}`}
                          position={{ lat, lng }}
                          icon={{
                            url: svgUrl,
                          }}
                          label={{
                            text: String(index + 1),
                            color: "white",
                            fontWeight: "bold",
                            fontSize: "11px",
                          }}
                          title={`${index + 1}. ${stop.location_name} (${isVerified ? "Verified" : "Custom"})`}
                          onMouseOver={() => setHoveredPin({ 
                            lat, 
                            lng, 
                            label: stop.location_name ?? "", 
                            distanceFromRoute: stop.distance_to_route_km,
                            sourceType: isVerified ? "verified" : "custom"
                          })}
                          onMouseOut={() => setHoveredPin(null)}
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
                          onMouseOver={() => setHoveredPin({ lat, lng, label: `Day ${index + 1}: ${selected.location_name ?? ""}` })}
                          onMouseOut={() => setHoveredPin(null)}
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
                      const isFocused = focusedFuelStation?.lat === station.lat && focusedFuelStation?.lng === station.lng
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
                            url: isFocused 
                              ? "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="10" fill="#dc2626" stroke="#991b1b" strokeWidth="2"/></svg>')
                              : "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8" fill="#ea580c" stroke="#c2410c" strokeWidth="2"/></svg>'),
                          }}
                          title={`${station.name}${distKm !== null ? ` — ${distKm} km from start` : ""}`}
                          onMouseOver={() => setHoveredPin({ lat: station.lat, lng: station.lng, label: `⛽ ${station.name}${distKm !== null ? ` (${distKm} km)` : ""}` })}
                          onMouseOut={() => setHoveredPin(null)}
                          onClick={() => {
                            setFocusedFuelStation({ lat: station.lat, lng: station.lng, name: station.name })
                            if (map) {
                              map.panTo({ lat: station.lat, lng: station.lng })
                              map.setZoom(14)
                            }
                          }}
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

                    {hoveredPin && (
                      <InfoWindow
                        position={{ lat: hoveredPin.lat, lng: hoveredPin.lng }}
                        options={{ 
                          disableAutoPan: true,
                          pixelOffset: new google.maps.Size(0, -10)
                        }}
                        onCloseClick={() => setHoveredPin(null)}
                      >
                        <div style={{ 
                          padding: "6px 10px", 
                          minWidth: "160px",
                          background: "#fff",
                          borderRadius: "4px",
                          boxShadow: "0 1px 4px rgba(0,0,0,0.2)"
                        }}>
                          <div style={{ fontWeight: 600, marginBottom: "3px", fontSize: "13px", color: "#1f2937" }}>
                            {hoveredPin.label}
                          </div>
                          {hoveredPin.sourceType && (
                            <div style={{ 
                              fontSize: "11px", 
                              color: hoveredPin.sourceType === "verified" ? "#16a34a" : "#dc2626",
                              fontWeight: 600,
                              marginBottom: "2px"
                            }}>
                              {hoveredPin.sourceType === "verified" ? "✓ Verified" : "⚠ Custom"}
                            </div>
                          )}
                          {hoveredPin.distanceFromRoute !== undefined && hoveredPin.distanceFromRoute !== null && hoveredPin.distanceFromRoute >= 0 && (
                            <div style={{ 
                              fontSize: "11px", 
                              color: hoveredPin.distanceFromRoute > 5 ? "#dc2626" : "#16a34a",
                              fontWeight: 500 
                            }}>
                              {hoveredPin.distanceFromRoute > 0 
                                ? `${Math.round(hoveredPin.distanceFromRoute)} km from route`
                                : "On route"
                              }
                            </div>
                          )}
                        </div>
                      </InfoWindow>
                    )}
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
                const distance = estimateSegmentDistance(segment, index)
                const duration = estimateSegmentDuration(segment, index)
                const region = getRegionLabel(segment, index)
                const remainingAfterThisDayKm = Math.max(0, totalRouteDistanceKm - segment.endKm)
                const fuelInfo = getFuelInfoForSegment(segment, index)
                const selectedOption = getSelectedOption(segment, index)
                const previousSelectedOption = index > 0 ? getSelectedOption(daySegments[index - 1], index - 1) : null
                const dayStartName = index === 0
                  ? trip.start_location_text
                  : (previousSelectedOption?.location_name || getRegionLabel(daySegments[index - 1], index - 1))
                const expanded = expandedSegments.has(index)
                const active = activeSegmentIndex === index

                const dayRouteData = unifiedDayRouteData[index]
                const allStops = dayRouteData?.allStops ?? []
                const dayShownStopCount = dayRouteData?.dayShownStopCount ?? 0
                const segmentOptionsFromApi = segment.options && segment.options.length > 0
                  ? segment.options
                  : allStops.slice(0, 3)
                const optionsToShow = expandedSegmentOptions.has(index)
                  ? segmentOptionsFromApi
                  : segmentOptionsFromApi.slice(0, 3)
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
                              {formatDistance(distance)} • {formatDuration(duration)} • {dayShownStopCount} shown stops
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

                        <div className="grid gap-4 lg:grid-cols-2">

                          {/* ── Day Stop Selector ── */}
                          {isArrivalDaySegment(index) ? (
                            <div className="flex items-center gap-2 rounded-2xl border border-dashed border-emerald-500/40 bg-emerald-50/10 p-4 text-sm text-muted-foreground">
                              <MapPin className="h-4 w-4 shrink-0 text-emerald-600" />
                              <span><span className="font-medium text-emerald-700 dark:text-emerald-400">Arrival day</span> — you reach your destination on this short leg. No overnight stop needed.</span>
                            </div>
                          ) : (
                          <div className="rounded-3xl bg-muted/5 p-4 space-y-4">
                            {/* Header */}
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-semibold">Overnight stop</span>
                                {selectedOption && (
                                  <Badge variant="secondary" className="text-xs">
                                    {selectedOption.region || selectedOption.state || "Selected"}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {selectedOption
                                  ? `Overnighting near ${selectedOption.location_name}. Tap another card to switch.`
                                  : "Pick an overnight stop for this leg."}
                              </p>
                            </div>

                            {/* 3-option card grid */}
                            {optionsToShow.length > 0 ? (
                              <div className="grid grid-cols-1 gap-3">
                                {optionsToShow.map((option, optIdx) => {
                                  const isSelected = option.id === selectedOption?.id
                                  const isRecommended = option.is_recommended === true
                                  const lateralDisplay = typeof option.distance_to_route_km === "number"
                                    ? option.distance_to_route_km
                                    : null
                                  const lateralColor = lateralDisplay === null
                                    ? "text-muted-foreground"
                                    : lateralDisplay <= 10
                                      ? "text-emerald-600"
                                      : lateralDisplay <= 20
                                        ? "text-amber-600"
                                        : "text-red-500"
                                  const descriptionText = option.why_stop_here || option.aao_tip || option.why_we_d_stay_again
                                  return (
                                    <button
                                      key={option.id}
                                      type="button"
                                      onClick={() => handleChooseSegmentOption(segment, index, option)}
                                      className={[
                                        "relative w-full text-left rounded-2xl border p-4 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                                        isSelected
                                          ? "border-primary bg-primary/5 shadow-sm"
                                          : isRecommended
                                            ? "border-amber-400 bg-amber-50/40 dark:bg-amber-900/10 hover:border-amber-500"
                                            : "border-muted/40 bg-background hover:border-muted/70 hover:bg-muted/5",
                                      ].join(" ")}
                                    >
                                      {/* Top row: number + name + selected tick */}
                                      <div className="flex items-start gap-2.5">
                                        <div className={[
                                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                                          isSelected
                                            ? "bg-primary text-primary-foreground"
                                            : isRecommended
                                              ? "bg-amber-400 text-white"
                                              : "bg-muted/40 text-muted-foreground",
                                        ].join(" ")}>
                                          {isSelected ? "✓" : optIdx + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                            {isRecommended && (
                                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                                                <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                                                Recommended
                                              </span>
                                            )}
                                            {isSelected && !isRecommended && (
                                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                                Selected
                                              </span>
                                            )}
                                          </div>
                                          <h3 className="font-semibold text-sm leading-tight truncate">{option.location_name}</h3>
                                        </div>
                                      </div>

                                      {/* Badges row */}
                                      <div className="mt-2.5 flex flex-wrap gap-1.5 ml-9">
                                        {(option.stay_type || option.route_type) && (
                                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                            {option.stay_type || option.route_type}
                                          </Badge>
                                        )}
                                        {option.is_verified && (
                                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/50 text-emerald-700 dark:text-emerald-400">
                                            DB Verified
                                          </Badge>
                                        )}
                                        {option.source === "google_places" && (
                                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-400/50 text-blue-600 dark:text-blue-400">
                                            Google
                                          </Badge>
                                        )}
                                        {lateralDisplay !== null && (
                                          <span className={`text-[10px] font-medium ${lateralColor}`}>
                                            {lateralDisplay < 1 ? "On route" : `${Math.round(lateralDisplay)} km off route`}
                                          </span>
                                        )}
                                      </div>

                                      {/* Amenity chips */}
                                      {(option.water || option.pet_friendly || option.cost_band) && (
                                        <div className="mt-2 ml-9 flex flex-wrap gap-1">
                                          {option.water === "Yes" && (
                                            <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 dark:bg-blue-900/20 px-1.5 py-0.5 text-[10px] text-blue-700 dark:text-blue-400">
                                              <Droplets className="h-2.5 w-2.5" /> Water
                                            </span>
                                          )}
                                          {option.pet_friendly === "Yes" && (
                                            <span className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/20 px-1.5 py-0.5 text-[10px] text-green-700 dark:text-green-400">
                                              Pets OK
                                            </span>
                                          )}
                                          {option.cost_band && (
                                            <span className="inline-flex items-center rounded-full bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                              {option.cost_band}
                                            </span>
                                          )}
                                        </div>
                                      )}

                                      {/* Description / tip text */}
                                      {descriptionText && (
                                        <p className="mt-2 ml-9 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                          {descriptionText}
                                        </p>
                                      )}
                                    </button>
                                  )
                                })}
                              </div>
                            ) : (
                              <div className="rounded-2xl border border-dashed border-muted/30 bg-muted/10 p-4 text-sm text-muted-foreground">
                                No overnight options for this day yet. Try rebuilding the plan.
                              </div>
                            )}

                            {/* Nearby places toggle — clearly separate from the 3 API options */}
                            <div className="pt-1">
                              <button
                                type="button"
                                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                onClick={() => {
                                  toggleSegmentOptions(index)
                                  void loadNearbyPlacesForDay(index, segment)
                                }}
                              >
                                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expandedSegmentOptions.has(index) ? "rotate-90" : ""}`} />
                                {expandedSegmentOptions.has(index) ? "Hide nearby places" : "Show nearby places from Google"}
                              </button>

                              {expandedSegmentOptions.has(index) && (
                                <div className="mt-3 space-y-2">
                                  {loadingPlaces.has(index) ? (
                                    <div className="rounded-xl border border-dashed border-muted/30 bg-muted/10 p-3 text-xs text-muted-foreground">
                                      Loading nearby places…
                                    </div>
                                  ) : nearbyAlternatives.length > 0 ? (
                                    nearbyAlternatives.map((place) => (
                                      <div key={`${place.name}-${place.lat}-${place.lng}`} className="flex items-center justify-between gap-3 rounded-xl border border-muted/30 bg-background p-3">
                                        <div className="min-w-0">
                                          <div className="font-medium text-xs truncate">{place.name}</div>
                                          <div className="text-[10px] text-muted-foreground truncate">{place.address}</div>
                                        </div>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="shrink-0 h-7 text-xs px-2"
                                          onClick={() => void handleAddPlaceToDay(index, {
                                            name: place.name,
                                            lat: place.lat,
                                            lng: place.lng,
                                            address: place.address,
                                            type: place.type,
                                          })}
                                        >
                                          Add
                                        </Button>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="rounded-xl border border-dashed border-muted/30 bg-muted/10 p-3 text-xs text-muted-foreground">
                                      No nearby places found for this area.
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          )}
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

            {/* TrackMate Overview Card */}
            <Card className="border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    TrackMate Overview
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
                    Ask TrackMate
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
