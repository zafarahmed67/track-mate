"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import TripAIChatCard from "./_components/TripAIChatCard"
import TripRouteOverview from "./_components/TripRouteOverview"
import TripPlanningAlerts from "./_components/TripPlanningAlerts"
import TripRouteMap from "./_components/TripRouteMap"
import TripPlanningControlsCard from "./_components/TripPlanningControlsCard"
import TripRouteHealthCard from "./_components/TripRouteHealthCard"
import TripWarningsAndNotesCard from "./_components/TripWarningsAndNotesCard"
import TripHeader from "./_components/TripHeader"
import TripTrackMateOverview from "./_components/TripTrackMateOverview"
import TripDayByDay from "./_components/TripDayByDay"
import TripDayByDayLoading from "./_components/TripDayByDayLoading"
import DeleteStop from "./_components/DeleteStop"
import DeleteTrip from "./_components/DeleteTrip"
import TripIsPolling from "./_components/TripIsPolling"
import TripLoading from "./_components/TripLoading"
import TripNotFound from "./_components/TripNotFound"
import { getStoredUser, hasAccess } from "@/lib/auth"
import { Fuel } from "lucide-react"
import {
  TripData,
  TripStop,
  FuelStation,
  RouteStopOption,
  ActiveItineraryDayRow,
  RouteSegment,
  DaysAdjustment,
  RouteMeta,
  TripNarrative
} from '@/types/trip'

export default function PlannerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const tripId = params.tripId as string
  const [userId, setUserId] = useState<string | null>(null)
  const [map, setMap] = useState<google.maps.Map | null>(null)
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null)

  const [loading, setLoading] = useState(true)
  const [isPolling, setIsPolling] = useState(false)
  const [tripNotFound, setTripNotFound] = useState(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const [trip, setTrip] = useState<TripData | null>(null)
  const [stops, setStops] = useState<TripStop[]>([])
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
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [selectedStopForDelete, setSelectedStopForDelete] = useState<{ id: string; name: string } | null>(null)
  const [routeMeta, setRouteMeta] = useState<Partial<RouteMeta>>({})

  const [routeWarnings, setRouteWarnings] = useState<string[]>([])
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null)
  const [expandedSegments, setExpandedSegments] = useState<Set<number>>(new Set())
  const [selectedSegmentOptionIds, setSelectedSegmentOptionIds] = useState<Record<number, string>>({})
  const [selectedSegmentFuelIds, setSelectedSegmentFuelIds] = useState<Record<number, string>>({})
  const [expandedSegmentOptions, setExpandedSegmentOptions] = useState<Set<number>>(new Set())
  const [segmentRouteOrderIds, setSegmentRouteOrderIds] = useState<Record<number, string[]>>({})
  const [excludedOptionIds, setExcludedOptionIds] = useState<Set<string>>(new Set())
  const [activeItineraryDays, setActiveItineraryDays] = useState<ActiveItineraryDayRow[]>([])
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
  const [tripNarrative, setTripNarrative] = useState<TripNarrative | null>(null)
  const [hoveredPin, setHoveredPin] = useState<{ lat: number; lng: number; label: string; distanceFromRoute?: number; sourceType?: "verified" | "custom" } | null>(null)
  const [focusedFuelStation, setFocusedFuelStation] = useState<{ lat: number; lng: number; name: string } | null>(null)
  const [hiddenCustomStopsByDay, setHiddenCustomStopsByDay] = useState<Record<number, string[]>>({})

  const normalizeStopId = (id: string | null | undefined): string => (id || "").replace(/^custom-/, "")
  const normalizeStopName = (name: string | null | undefined): string =>
    (name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

  const getStopDistanceKm = (stop: Pick<RouteStopOption, "distance_from_start_km"> | null | undefined) => {
    const distance = Number(stop?.distance_from_start_km)
    return Number.isFinite(distance) ? distance : null
  }

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

  // Use adjusted days from API if available (when days were auto-adjusted for realistic pacing),
  // otherwise fall back to user's requested days from the trip.
  const requestedDays = Math.max(1, Number(trip?.trip_duration_days || 1))

  const persistedDaysAdjustment = useMemo(() => {
    const routeJson = trip?.route_data_json
    if (!routeJson || typeof routeJson !== "object") return null

    const adjustment = (routeJson as { daysAdjustment?: Partial<DaysAdjustment> }).daysAdjustment
    const originalDays = Number(adjustment?.originalDays)
    const adjustedToDays = Number(adjustment?.adjustedToDays)
    if (!Number.isFinite(originalDays) || !Number.isFinite(adjustedToDays)) return null

    return {
      originalDays,
      adjustedToDays,
      reason: adjustment?.reason || "Adjusted to a realistic number of travel days based on distance.",
    }
  }, [trip?.route_data_json])

  const effectiveDaysAdjustment = routeMeta.daysAdjustment ?? persistedDaysAdjustment
  const adjustedDays = effectiveDaysAdjustment?.adjustedToDays
  const targetDays = adjustedDays ?? requestedDays

  const totalTripDistanceKm = trip?.total_distance_km || 0

  const showPlanningSkeleton = false

  const allDaySegments = useMemo(
    () => {
      return Array.from({ length: targetDays }, (_, index) => ({
        startKm: Math.round(totalTripDistanceKm * (index / targetDays)),
        endKm: Math.round(totalTripDistanceKm * ((index + 1) / targetDays)),
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
      }))
    },
    [totalTripDistanceKm, targetDays]
  )

  const plannedDays = allDaySegments.length
  const effectiveDayCount = Math.max(1, plannedDays)
  const daySegments = useMemo(
    () => allDaySegments.slice(0, effectiveDayCount),
    [allDaySegments, effectiveDayCount]
  )

  // Auto-select the first recommended option for each day if nothing is selected yet
  useEffect(() => {
    if (daySegments.length === 0) return
    const newSelections: Record<number, string> = {}
    daySegments.forEach((segment, index) => {
      if (selectedSegmentOptionIds[index]) return // Already selected, skip
      const firstOption = segment.recommendedOption ?? segment.options?.[0] ?? segment.verifiedStops?.[0] ?? segment.otherStops?.[0]
      if (firstOption?.id) {
        newSelections[index] = firstOption.id
      }
    })
    if (Object.keys(newSelections).length > 0) {
      setSelectedSegmentOptionIds((prev) => ({ ...prev, ...newSelections }))
    }
  }, [daySegments, selectedSegmentOptionIds])

  const totalRouteDistanceKm = routeMeta.drivingInfo?.totalDistanceKm || 0

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
      setSelectedStops((prev) => prev.filter((id) => id !== selectedStopForDelete.id))
      toast.success("Stop removed from trip")
    } catch (error) {
      console.error("Error removing stop:", error)
    } finally {
      setSelectedStopForDelete(null)
    }
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

  const tripStopToRouteOption = useCallback((stop: TripStop): RouteStopOption => ({
    id: normalizeStopId(stop.stop_id || stop.id) || stop.id,
    location_name: stop.location_name || "",
    latitude: stop.latitude,
    longitude: stop.longitude,
    state: stop.state,
    region: stop.region,
    route_type: stop.route_type || stop.stop_type,
    stay_type: stop.stay_type || stop.stop_type,
    pet_friendly: stop.pet_friendly,
    water: stop.water,
    cost_band: stop.cost_band,
    tier: stop.tier,
    is_verified: stop.verification_status !== "custom",
    distance_from_start_km: stop.distance_from_start_km,
    distance_to_route_km: stop.distance_to_route_km,
    source: stop.verification_status === "custom" ? "google_places" : "database",
  }), [])

  const getOptionIdentityKeys = useCallback((option: RouteStopOption) => {
    const normalizedId = normalizeStopId(option.id)
    const normalizedName = normalizeStopName(option.location_name)
    const lat = Number(option.latitude)
    const lng = Number(option.longitude)
    const distance = getStopDistanceKm(option)

    return [
      normalizedId ? `id:${normalizedId}` : "",
      normalizedName && Number.isFinite(lat) && Number.isFinite(lng)
        ? `place:${normalizedName}|${lat.toFixed(3)}|${lng.toFixed(3)}`
        : "",
      normalizedName && distance !== null ? `name-km:${normalizedName}|${Math.round(distance)}` : "",
    ].filter(Boolean)
  }, [])

  const getMergedSegmentOptions = useCallback((segment: RouteSegment, segmentIndex: number, maxOptions = 3) => {
    const apiOptions = segment.options && segment.options.length > 0
      ? segment.options
      : filterStopsBySegmentDistance(segment, [...segment.verifiedStops, ...segment.otherStops])

    const itineraryOptions = activeItineraryDays
      .filter((row) => Number(row.day_number) === segmentIndex + 1)
      .sort((a, b) => Number(a.day_order ?? 999) - Number(b.day_order ?? 999))
      .map((row): RouteStopOption | null => {
        const rowStopIds = [row.stop_id, row.custom_stop_id]
          .map((id) => normalizeStopId(String(id || "")))
          .filter(Boolean)
        const rowName = normalizeStopName(row.to_location || "")

        const matchedStop = stops.find((stop) => {
          const stopIds = [
            normalizeStopId(stop.id || ""),
            normalizeStopId(stop.stop_id || ""),
          ].filter(Boolean)
          if (rowStopIds.length > 0 && stopIds.some((id) => rowStopIds.includes(id))) return true
          return rowName !== "" && normalizeStopName(stop.location_name) === rowName
        })

        if (!matchedStop) return null
        return { ...tripStopToRouteOption(matchedStop), is_recommended: Boolean(row.is_selected) }
      })
      .filter((option): option is RouteStopOption => Boolean(option))

    const persistedOptions = stops
      .filter((stop) => {
        if (excludedOptionIds.has(normalizeStopId(stop.stop_id || stop.id) || stop.id)) return false
        if (typeof stop.day_index === "number" && Number.isFinite(stop.day_index)) {
          return Math.trunc(stop.day_index) === segmentIndex
        }
        const distance = Number(stop.distance_from_start_km)
        return Number.isFinite(distance) && distance >= segment.startKm && distance <= segment.endKm
      })
      .map(tripStopToRouteOption)

    // Build a lookup of which stop ids/names the API already flagged as recommended,
    // so we can restore the flag after deduplication (itineraryOptions strips it).
    const apiRecommendedIds = new Set<string>()
    const apiRecommendedNames = new Set<string>()
    for (const opt of apiOptions) {
      if ((opt as { is_recommended?: boolean }).is_recommended) {
        if (opt.id) apiRecommendedIds.add(opt.id)
        if (opt.location_name) apiRecommendedNames.add(normalizeStopName(opt.location_name))
      }
    }

    const merged: RouteStopOption[] = []
    const seenKeys = new Set<string>()

    const addOption = (option: RouteStopOption) => {
      if (excludedOptionIds.has(option.id)) return
      const keys = getOptionIdentityKeys(option)
      if (keys.length > 0 && keys.some((key) => seenKeys.has(key))) return
      merged.push(option)
      keys.forEach((key) => seenKeys.add(key))
    }

    itineraryOptions.forEach(addOption)
    apiOptions.forEach(addOption)
    persistedOptions
      .sort((a, b) => {
        const aDistance = getStopDistanceKm(a) ?? Number.MAX_SAFE_INTEGER
        const bDistance = getStopDistanceKm(b) ?? Number.MAX_SAFE_INTEGER
        return Math.abs(aDistance - segment.endKm) - Math.abs(bDistance - segment.endKm)
      })
      .forEach(addOption)

    // Restore is_recommended from the API response — itineraryOptions can add a stop before
    // the apiOptions version (which carries is_recommended), causing the flag to be lost.
    for (const option of merged) {
      if (!option.is_recommended && (
        apiRecommendedIds.has(option.id) ||
        apiRecommendedNames.has(normalizeStopName(option.location_name))
      )) {
        option.is_recommended = true
      }
    }

    // Enforce DB stops take priority — only one recommended per day
    const hasDbRecommended = merged.some((opt) => opt.is_verified && opt.is_recommended)
    if (hasDbRecommended) {
      for (const option of merged) {
        if (!option.is_verified) {
          option.is_recommended = false
        }
      }
    }

    const recommendedIndex = merged.findIndex((option) => option.is_recommended)
    if (recommendedIndex > 0) {
      const [recommended] = merged.splice(recommendedIndex, 1)
      merged.unshift(recommended)
    }

    return merged.slice(0, maxOptions)
  }, [activeItineraryDays, excludedOptionIds, filterStopsBySegmentDistance, getOptionIdentityKeys, stops, tripStopToRouteOption])

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
    try {
      const sorted = await sortStopsAlongRoute(stops)
      setStops(sorted)
      setSelectedSegmentOptionIds({})
      setExpandedSegmentOptions(new Set())
      toast.success("Plan rebuilt")
    } catch (error) {
      console.error("Error rebuilding plan:", error)
      toast.error("Failed to rebuild plan")
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

    // Compute selected stops from segments and user selections.
    // Seed usedIds with excludedOptionIds so excluded stops are never used as waypoints.
    const usedIds = new Set<string>(excludedOptionIds)
    const selectedStopsByDay = daySegments.map((seg, i) => {
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
    })

    const finalDayStop = selectedStopsByDay[daySegments.length - 1] ?? null
    const finalStopLat = finalDayStop ? parseFloat(String(finalDayStop.latitude || "")) : NaN
    const finalStopLng = finalDayStop ? parseFloat(String(finalDayStop.longitude || "")) : NaN
    const hasFinalStopEndpoint = Number.isFinite(finalStopLat) && Number.isFinite(finalStopLng)
    const destination = hasFinalStopEndpoint
      ? new google.maps.LatLng(finalStopLat, finalStopLng)
      : new google.maps.LatLng(trip.destination_lat!, trip.destination_lng!)
    const selectedStops = selectedStopsByDay.filter((stop): stop is RouteStopOption => stop !== null)
    const routeWaypointStops = hasFinalStopEndpoint
      ? selectedStops.filter((stop) => stop.id !== finalDayStop?.id)
      : selectedStops

    // Google Directions API supports max 25 waypoints. For longer trips, keep
    // only evenly-spaced stops so the route still represents the full journey.
    const MAX_WAYPOINTS = 25
    const cappedStops = routeWaypointStops.length > MAX_WAYPOINTS
      ? (() => {
        const step = routeWaypointStops.length / MAX_WAYPOINTS
        return Array.from({ length: MAX_WAYPOINTS }, (_, i) =>
          routeWaypointStops[Math.min(Math.round(i * step), routeWaypointStops.length - 1)]
        )
      })()
      : routeWaypointStops

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
      const currentStop = resolvedDaySelections[index]
      const previousValidStop = index > 0
        ? resolvedDaySelections.slice(0, index).findLast((stop) => getStopDistanceKm(stop) !== null)
        : null

      const currentStopKm = getStopDistanceKm(currentStop)
      const previousStopKm = getStopDistanceKm(previousValidStop)
      const endKm = currentStopKm !== null
        ? currentStopKm
        : index === daySegments.length - 1 && totalRouteDistanceKm > 0
          ? totalRouteDistanceKm
          : segment.endKm
      const startKm = index === 0
        ? 0
        : previousStopKm !== null
          ? previousStopKm
          : segment.startKm

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

  // Pre-compute each day's selection sequentially — single source of truth for dedup
  const resolvedDaySelections = useMemo(() => {
    const usedIds = new Set<string>(excludedOptionIds)
    const usedPhysicalKeys = new Set<string>()
    let lastSelectedKm: number | null = null

    const getSelectionPhysicalKeys = (stop: RouteStopOption) => {
      const normalizedId = normalizeStopId(stop.id)
      const normalizedName = normalizeStopName(stop.location_name)
      const lat = Number(stop.latitude)
      const lng = Number(stop.longitude)
      const distance = getStopDistanceKm(stop)

      return [
        normalizedId ? `id:${normalizedId}` : "",
        normalizedName ? `name:${normalizedName}` : "",
        normalizedName && Number.isFinite(lat) && Number.isFinite(lng)
          ? `place:${normalizedName}|${lat.toFixed(3)}|${lng.toFixed(3)}`
          : "",
        distance !== null ? `km:${Math.round(distance)}` : "",
      ].filter(Boolean)
    }

    const markUsed = (stop: RouteStopOption) => {
      usedIds.add(stop.id)
      getSelectionPhysicalKeys(stop).forEach((key) => usedPhysicalKeys.add(key))
      const distance = getStopDistanceKm(stop)
      if (distance !== null) lastSelectedKm = distance
    }

    const canSelect = (stop: RouteStopOption | null | undefined): stop is RouteStopOption => {
      if (!stop) return false
      if (usedIds.has(stop.id) || excludedOptionIds.has(stop.id)) return false
      if (getSelectionPhysicalKeys(stop).some((key) => usedPhysicalKeys.has(key))) return false

      const distance = getStopDistanceKm(stop)
      if (distance !== null && lastSelectedKm !== null && distance <= lastSelectedKm + 1) {
        return false
      }

      return true
    }

    return daySegments.map((seg, i) => {
      const allOptions = getMergedSegmentOptions(seg, i, 12)
      const visible = allOptions.filter((o) => !excludedOptionIds.has(o.id))
      const explicitId = selectedSegmentOptionIds[i]
      if (explicitId) {
        const explicit = visible.find((o) => o.id === explicitId)
        if (canSelect(explicit)) {
          markUsed(explicit)
          return explicit
        }
      }
      // Prefer recommendedOption from API first
      if (canSelect(seg.recommendedOption)) {
        markUsed(seg.recommendedOption)
        return seg.recommendedOption
      }
      const pick = visible.find((o) => canSelect(o)) ?? null
      if (pick) markUsed(pick)
      return pick
    })
  }, [daySegments, selectedSegmentOptionIds, excludedOptionIds, getMergedSegmentOptions])

  const getSelectedOption = (segment: RouteSegment, segmentIndex?: number) => {
    if (segmentIndex !== undefined) {
      const resolved = resolvedDaySelections[segmentIndex]
      return resolved ?? undefined
    }
    // Fallback path (no segmentIndex): prefer recommendedOption for consistency
    if (segment.recommendedOption && !excludedOptionIds.has(segment.recommendedOption.id)) {
      return segment.recommendedOption
    }
    const allOptions = getMergedSegmentOptions(segment, 0, 12)
    return allOptions.filter((o) => !excludedOptionIds.has(o.id))[0]
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

  const handleChooseFuel = useCallback(async (segmentIndex: number, fuelKey: string) => {
    const next = { ...selectedSegmentFuelIds, [segmentIndex]: fuelKey }
    setSelectedSegmentFuelIds(next)
    const currentRouteDataJson = (trip?.route_data_json ?? {}) as Record<string, unknown>
    await fetch(`/api/trips/${tripId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        route_data_json: { ...currentRouteDataJson, selectedSegmentFuelIds: next },
      }),
    })
  }, [selectedSegmentFuelIds, trip, tripId, userId])

  const getFuelGapInfo = (segment: RouteSegment, index: number) => {
    const totalKm = routeMeta.drivingInfo?.totalDistanceKm ?? 0
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
    if (effectiveDaysAdjustment) {
      warnings.push("Adjusted to a realistic number of travel days based on distance.")
    }
    setRouteWarnings(warnings)
  }, [routeMeta.corridor, routeMeta.fuelStations, routeMeta.planningMode, daySegments, effectiveDaysAdjustment])


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
        console.log("Fetch trip response:", data);

        if (!data.success || !data.trip) {
          setTripNotFound(true)
          setLoading(false)
          return
        }

        setTrip(data.trip)

        // Handle itinerary_days rows from the API
        if (Array.isArray(data.stops) && data.stops.length > 0) {
          const firstStop = data.stops[0]
          
          // Check if this is an itinerary_days row (has day_number) or old trip_itineraries (has stops_by_day_json)
          if (typeof firstStop.day_number === "number") {
            // New format: data.stops is array of itinerary_days rows
            console.log("Setting activeItineraryDays from itinerary_days rows:", data.stops)
            setActiveItineraryDays(data.stops as ActiveItineraryDayRow[])
          } else if (firstStop.stops_by_day_json) {
            // Old format: data.stops is array of trip_itineraries with stops_by_day_json
            const stopsByDayJson = firstStop.stops_by_day_json as Record<string, Array<{
              id: string
              name: string
              dayOrder?: number
              isSelected?: boolean
              sourceType?: string
            }>>

            console.log("Raw stops_by_day_json:", stopsByDayJson)

            const formattedItineraryDays: ActiveItineraryDayRow[] = []
            Object.entries(stopsByDayJson).forEach(([dayKey, dayStops]) => {
              if (Array.isArray(dayStops)) {
                dayStops.forEach((stop) => {
                  const dayNum = parseInt(dayKey.replace("day", ""), 10) || 1
                  formattedItineraryDays.push({
                    day_number: dayNum,
                    day_order: stop.dayOrder,
                    source_type: stop.sourceType,
                    stop_id: stop.sourceType === "custom" ? null : stop.id,
                    custom_stop_id: stop.sourceType === "custom" ? stop.id : null,
                    is_selected: stop.isSelected,
                    to_location: stop.name,
                  })
                })
              }
            })
            setActiveItineraryDays(formattedItineraryDays)
          }
        }

        // Legacy: populate TripStop array (used for map rendering and other legacy code)
        const formattedStops: TripStop[] = []
        if (Array.isArray(data.stops) && data.stops.length > 0) {
          const firstStop = data.stops[0]
          if (firstStop.stops_by_day_json) {
            const stopsByDayJson = firstStop.stops_by_day_json as Record<string, Array<{
              id: string
              name: string
              dayOrder?: number
              isSelected?: boolean
              sourceType?: string
            }>>
            Object.entries(stopsByDayJson).forEach(([dayKey, dayStops]) => {
              if (Array.isArray(dayStops)) {
                dayStops.forEach((stop, idx) => {
                  const dayNum = parseInt(dayKey.replace("day", ""), 10) || 1
                  formattedStops.push({
                    id: stop.id,
                    stop_id: stop.id,
                    location_name: stop.name,
                    day_index: dayNum - 1,
                    verification_status: stop.sourceType || "custom",
                    is_selected: stop.isSelected ?? false,
                    day_order: stop.dayOrder ?? idx + 1,
                  })
                })
              }
            })
          }
        }

        console.log("Formatted stops:", formattedStops)
        if (formattedStops.length > 0) {
          setStops(formattedStops)
        }
      } catch (error) {
        console.error("Error fetching trip:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchTripData()
  }, [router, tripId])

  useEffect(() => {
    if (!isPolling || !tripId) return

    if (pollingIntervalRef.current) return

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const storedUser = getStoredUser()
        const uid = storedUser?.id
        const response = await fetch(`/api/trips/${tripId}`)
        const data = await response.json()

        if (data.success && data.trip && (data.trip.status === "completed" || data.trip.status === "saved")) {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
            pollingIntervalRef.current = null
          }
          setIsPolling(false)
          setTrip(data.trip)

          const itinerariesResponse = await fetch(`/api/trips/${tripId}/itineraries?user_id=${uid}`)
          const itinerariesData = await itinerariesResponse.json()

          if (itinerariesData.success) {
            setActiveItineraryDays(Array.isArray(itinerariesData.activeDays) ? itinerariesData.activeDays : [])
          }

          const formattedStops: TripStop[] = []
          const stopsByDayJson = data.stops?.[0]?.stops_by_day_json as Record<string, Array<{
            id: string
            name: string
            dayOrder?: number
            isSelected?: boolean
            sourceType?: string
          }>> | undefined

          if (stopsByDayJson) {
            Object.entries(stopsByDayJson).forEach(([dayKey, dayStops]) => {
              if (Array.isArray(dayStops)) {
                dayStops.forEach((stop, idx) => {
                  const dayNum = parseInt(dayKey.replace("day", ""), 10) || 1
                  formattedStops.push({
                    id: stop.id,
                    stop_id: stop.id,
                    location_name: stop.name,
                    day_index: dayNum,
                    verification_status: stop.sourceType || "custom",
                    is_selected: stop.isSelected ?? false,
                    day_order: stop.dayOrder ?? idx + 1,
                  })
                })
              }
            })
          }

          setStops(formattedStops)
          setLoading(false)
        }
      } catch (error) {
        console.error("Polling error:", error)
      }
    }, 5000)
  }, [isPolling, tripId])

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [])

  const mapCenter = useMemo(() => {
    if (trip?.start_lat && trip?.start_lng) {
      return { lat: trip.start_lat, lng: trip.start_lng }
    }
    return { lat: -25.2744, lng: 133.7751 }
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
          location_name: stop.location_name ?? "",
          latitude: stop.latitude ?? "0",
          longitude: stop.longitude ?? "0",
          state: stop.state ?? "",
          region: stop.region ?? "",
          route_type: stop.route_type ?? "",
          stay_type: stop.stay_type ?? "",
          pet_friendly: stop.pet_friendly ?? "",
          water: stop.water ?? "",
          cost_band: stop.cost_band ?? "",
          tier: stop.tier ?? "",
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
        if (!stop.location_name) return false
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
  }, [daySegments, resolvedDaySelections, getSelectedOption])


  useEffect(() => {
    if (loading) return

    const savedStops = stops.filter((stop) => stop.verification_status !== "custom")
    const customStops = stops.filter((stop) => stop.verification_status === "custom")
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
    return <TripLoading />
  }

  if (!trip) {
    return <TripNotFound />
  }

  return (
    <>
      {isPolling && <TripIsPolling />}

      {!isPolling && (
        <main className="min-h-screen bg-background">
          <TripHeader
            trip={trip}
            tripId={tripId}
            routeMeta={routeMeta}
            saving={saving}
            onSaveTrip={handleSaveTrip}
            onExportPdf={handleExportPdf}
            onDeleteClick={() => setShowDeleteConfirm(true)}
            computeEstimatedDays={computeEstimatedDays}
            formatDistance={formatDistance}
            formatDuration={formatDuration}
            capitalize={capitalize}
          />

          <div className="container mx-auto px-6 py-4">
            <div className="mb-6 grid gap-4 lg:grid-cols-[1.8fr_1fr]">
              <TripRouteOverview
                routeMeta={routeMeta}
                trip={trip}
                formatDistance={formatDistance}
                formatDuration={formatDuration}
                computeEstimatedDays={computeEstimatedDays}
                capitalize={capitalize}
                getRouteDescription={getRouteDescription}
              />
              <TripPlanningAlerts
                routeWarnings={routeWarnings}
              />
            </div>

            {showEditWarningBanner && Array.isArray(editWarnings) && editWarnings.length > 0 && (
              <Card className="border-amber-500/40 bg-amber-500/5 mb-4">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Fuel className="h-5 w-5 text-amber-600" />
                      Fuel Gap Warning
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowFuelOverlay(true)
                          map?.panTo(mapCenter)
                          const firstCriticalIdx = daySegments.findIndex(s => s.fuelCritical)
                          if (firstCriticalIdx >= 0) setActiveSegmentIndex(firstCriticalIdx)
                          dismissEditWarning()
                        }}
                      >
                        <Fuel className="mr-1.5 h-4 w-4" />
                        Show fuel on map
                      </Button>
                      <Button variant="ghost" size="sm" onClick={dismissEditWarning}>Dismiss</Button>
                    </div>
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

            <TripRouteMap
              showFuelOverlay={showFuelOverlay}
              setShowFuelOverlay={setShowFuelOverlay}
              showOvernightOverlay={showOvernightOverlay}
              setShowOvernightOverlay={setShowOvernightOverlay}
              showRemoteOverlay={showRemoteOverlay}
              setShowRemoteOverlay={setShowRemoteOverlay}
              map={map}
              setMap={setMap}
              mapCenter={mapCenter}
              directions={directions}
              trip={trip}
              recommendedMapStops={recommendedMapStops}
              daySegments={daySegments}
              getSelectedOption={getSelectedOption}
              fuelStations={fuelStations}
              selectedSegmentFuelIds={selectedSegmentFuelIds}
              setFocusedFuelStation={setFocusedFuelStation}
              routeMetaSegments={routeMeta.segments}
              estimateSegmentDistance={estimateSegmentDistance}
              getSegmentDayType={getSegmentDayType}
              hoveredPin={hoveredPin}
              setHoveredPin={setHoveredPin}
            />


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

                {showPlanningSkeleton ? (
                  <TripDayByDayLoading targetDays={targetDays} />
                ) : (
                  <TripDayByDay
                    stops={stops}
                    daySegments={daySegments}
                    expandedSegments={expandedSegments}
                    activeSegmentIndex={activeSegmentIndex}
                    expandedSegmentOptions={expandedSegmentOptions}
                    getMergedSegmentOptions={getMergedSegmentOptions}
                    resolvedDaySelections={resolvedDaySelections}
                    getSelectedOption={getSelectedOption}
                    getSelectedFuelSuggestion={getSelectedFuelSuggestion}
                    getStopDistanceKm={getStopDistanceKm}
                    tripStartLocationText={trip.start_location_text}
                    estimateSegmentDistance={estimateSegmentDistance}
                    estimateSegmentDuration={estimateSegmentDuration}
                    getRegionLabel={getRegionLabel}
                    getFuelInfoForSegment={getFuelInfoForSegment}
                    getFuelGapInfo={getFuelGapInfo}
                    getFuelStationKey={getFuelStationKey}
                    getSegmentDayType={getSegmentDayType}
                    formatDistance={formatDistance}
                    formatDuration={formatDuration}
                    handleChooseSegmentOption={handleChooseSegmentOption}
                    toggleSegmentExpanded={toggleSegmentExpanded}
                    setActiveSegmentIndex={setActiveSegmentIndex}
                    handleChooseFuel={handleChooseFuel}
                  />
                )}

                <TripTrackMateOverview
                  savedNarrative={tripNarrative}
                  tripNarrative={tripNarrative}
                  setTripNarrative={setTripNarrative}
                  hasSegments={!!routeMeta.segments?.length}
                  effectiveDayCount={effectiveDayCount}
                  daySegments={daySegments}
                  selectedSegmentOptionIds={selectedSegmentOptionIds}
                  trip={trip}
                  tripId={tripId}
                  userId={userId}
                  setActiveItineraryDays={setActiveItineraryDays}
                  autoGenerateOnMount={(trip?.status === "completed" || trip?.status === "saved") && !tripNarrative}
                />
              </div>

              <div className="space-y-5">
                <TripPlanningControlsCard
                  travelPace={trip.travel_pace}
                  preferredLegLengthKm={preferredLegLengthKm}
                  setPreferredLegLengthKm={setPreferredLegLengthKm}
                  avoidLongDays={avoidLongDays}
                  setAvoidLongDays={setAvoidLongDays}
                  preferVerifiedStops={preferVerifiedStops}
                  setPreferVerifiedStops={setPreferVerifiedStops}
                  includeFreeCamps={includeFreeCamps}
                  setIncludeFreeCamps={setIncludeFreeCamps}
                  includeFuelPlanning={includeFuelPlanning}
                  setIncludeFuelPlanning={setIncludeFuelPlanning}
                  handleRebuildPlan={handleRebuildPlan}
                />

                <TripRouteHealthCard
                  averageKmPerDay={averageKmPerDay}
                  longestLegKm={Array.isArray(daySegments) ? Math.max(...daySegments.map((seg) => estimateSegmentDistance(seg)), 0).toFixed(2) : '0.00'}
                  fuelStationCount={typeof fuelStationCount === 'function' ? fuelStationCount() : 0}
                  longestFuelGapKm={typeof longestFuelGapKm === 'function' ? longestFuelGapKm() : 0}
                  fuelCriticalCount={typeof fuelCriticalCount === 'function' ? fuelCriticalCount() : 0}
                  remoteSectionCount={typeof remoteSectionCount === 'function' ? remoteSectionCount() : 0}
                />

                <TripWarningsAndNotesCard />

                <TripAIChatCard
                  tripId={tripId as string}
                  userId={userId}
                  tripNarrative={tripNarrative}
                  routeMeta={routeMeta}
                  tripTitle={trip?.title}
                />

              </div>
            </div>
          </div>

          <DeleteTrip
            open={showDeleteConfirm}
            onOpenChange={setShowDeleteConfirm}
            onConfirm={handleDeleteTrip}
            deleting={deleting}
          />

          <DeleteStop
            stop={selectedStopForDelete}
            open={!!selectedStopForDelete}
            onOpenChange={(open) => !open && setSelectedStopForDelete(null)}
            onConfirm={confirmDeleteStop}
          />
        </main>
      )}
    </>
  )
}
