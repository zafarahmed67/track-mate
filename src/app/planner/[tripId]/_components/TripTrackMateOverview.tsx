"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { useEffect, useState, useRef, type Dispatch, type SetStateAction } from "react"
import {
  Sparkles,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  ChevronRight,
  Fuel,
  Route,
  Caravan,
} from "lucide-react"

import type { TripNarrative } from "@/types/trip"

interface ItineraryVersion {
  id: string
  version: number
  status: string
  model_name: string | null
  created_at: string
}

interface TripData {
  id: string
  title: string
  start_location_text: string
  destination_text: string
  end_date?: string | null
  trip_duration_days: number
  travel_pace: string
  rig_type?: string | null
  rig_length_m?: number | null
  avoid_gravel_roads?: boolean
  pet_friendly_required?: boolean
}

interface ActiveItineraryDayRow {
  day_number?: number
  day_order?: number
  source_type?: string
  stop_id?: string | null
  custom_stop_id?: string | null
  is_selected?: boolean
  to_location?: string | null
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

interface RouteMeta {
  corridor?: string | undefined
  drivingInfo?: { totalDistanceKm: number; totalDurationMinutes: number } | undefined
  fuelStations?: FuelStation[] | undefined
  planningMode?: string | undefined
  segments?: DaySegment[] | undefined
}

interface StopOption {
  id: string
  location_name: string
  stay_type?: string
  route_type?: string
  why_stop_here?: string
  aao_tip?: string
  latitude?: string
  longitude?: string
  is_verified?: boolean
  road_suitability?: string
  why_we_d_stay_again?: string
}

interface DaySegment {
  options?: StopOption[]
  verifiedStops?: StopOption[]
  otherStops?: StopOption[]
  recommendedOption?: StopOption | null
  overnightAnchorName?: string | null
  fuelCritical?: boolean
  isRemote?: boolean
  fuelWarning?: string | null
  primaryFuelSuggestion?: { name: string; distanceFromStartKm?: number | null } | null
  gapFromLastFuelKm?: number | null
  gapToNextFuelKm?: number | null
  degradedMode?: boolean
}

interface TripTrackMateOverviewProps {
  itineraryVersions: ItineraryVersion[]
  narrativeLoading?: boolean
  setNarrativeLoading?: Dispatch<SetStateAction<boolean>>
  tripNarrative: TripNarrative | null
  setTripNarrative: Dispatch<SetStateAction<TripNarrative | null>>
  hasSegments: boolean
  restoringVersion: string | null
  effectiveDayCount: number
  daySegments: DaySegment[]
  selectedSegmentOptionIds: Record<number, string>
  trip: TripData
  tripId: string
  userId: string | null
  routeMeta: Partial<RouteMeta>
  setItineraryVersions: Dispatch<SetStateAction<ItineraryVersion[]>>
  setActiveItineraryDays: Dispatch<SetStateAction<ActiveItineraryDayRow[]>>
  getSelectedOption: (segment: any, index?: number) => any
  estimateSegmentDistance: (segment: any, index?: number) => number
  estimateSegmentDuration: (segment: any, index?: number) => number
  setRestoringVersion: Dispatch<SetStateAction<string | null>>
  savedNarrative: TripNarrative | null
  autoGenerateOnMount?: boolean
}

export default function TripTrackMateOverview({
  itineraryVersions,
  tripNarrative,
  setTripNarrative,
  hasSegments,
  restoringVersion,
  effectiveDayCount,
  daySegments,
  selectedSegmentOptionIds,
  trip,
  tripId,
  userId,
  routeMeta,
  setItineraryVersions,
  setActiveItineraryDays,
  getSelectedOption,
  estimateSegmentDistance,
  estimateSegmentDuration,
  setRestoringVersion,
  savedNarrative,
  autoGenerateOnMount = false
}: TripTrackMateOverviewProps) {
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [narrativeLoading, setNarrativeLoading] = useState(false)
  const autoGenerateRef = useRef(false)
  const [itineraryVersionsLoaded, setItineraryVersionsLoaded] = useState(false)

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
        const verifiedStops = (segment.verifiedStops ?? []).map((s) => ({
          location_name: s.location_name,
          stay_type: s.stay_type ?? null,
          route_type: s.route_type ?? null,
          aao_tip: s.aao_tip ?? null,
          why_stop_here: s.why_stop_here ?? null,
          why_we_d_stay_again: s.why_we_d_stay_again ?? null,
        }))

        const optionStops = [...(segment.verifiedStops ?? []), ...(segment.otherStops ?? [])].map((s) => ({
          location_name: s.location_name,
          stay_type: s.stay_type ?? null,
          route_type: s.route_type ?? null,
          aao_tip: s.aao_tip ?? null,
          why_stop_here: s.why_stop_here ?? null,
          why_we_d_stay_again: s.why_we_d_stay_again ?? null,
          is_verified: Boolean(s.is_verified),
        }))

        // Lock allowedStopNames to the user's actual selection so the AI's suggestedStay
        // matches the day card. Fall back to all options only when no stop is selected.
        const selectedStopName = getSelectedOption(segment, index)?.location_name ?? null
        const allowedStopNames = selectedStopName
          ? [selectedStopName]
          : Array.from(new Set(optionStops.map((s) => s.location_name).filter(Boolean)))

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
        (s.verifiedStops ?? []).some((v) => v.road_suitability?.toLowerCase() === "gravel" || v.road_suitability?.toLowerCase() === "4wd") ||
        (s.otherStops ?? []).some((v) => v.road_suitability?.toLowerCase() === "gravel" || v.road_suitability?.toLowerCase() === "4wd")
      )
      const roadConditionNote = hasGravelSegments
        ? "Some overnight stop options on this route require gravel or 4WD access. Verify road conditions before committing to each leg."
        : null

      const response = await fetch(`/api/trips/${tripId}/itineraries`, {
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

      console.log("Narrative generation response", response)

      const result = await response.json()
      if (result.success) {
        setTripNarrative(result.narrative)
        toast.success("TrackMate Overview generated and saved")
        // Refresh version history after new generation
        if (userId) {
          fetch(`/api/trips/${tripId}/itineraries?user_id=${userId}`)
            .then((r) => r.json())
            .then((d) => {
              if (d.success) {
                setItineraryVersions(d.itineraries)
                setActiveItineraryDays(Array.isArray(d.activeDays) ? d.activeDays : [])
                setItineraryVersionsLoaded(true)
              }
            })
            .catch(() => { })
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

  useEffect(() => {
    if (!userId) return

    const controller = new AbortController()
    let retryTimeout: ReturnType<typeof setTimeout> | null = null
    let isCancelled = false

    const loadItineraries = async (isRetry = false) => {
      try {
        const response = await fetch(
          `/api/trips/${tripId}/itineraries?user_id=${userId}`,
          { signal: controller.signal }
        )

        if (!response.ok) {
          throw new Error(`Failed to fetch itineraries: ${response.status}`)
        }

        const data = await response.json()

        if (!data.success || isCancelled) return

        setItineraryVersions(data.itineraries ?? [])
        setActiveItineraryDays(Array.isArray(data.activeDays) ? data.activeDays : [])
        setItineraryVersionsLoaded(true)

        if (!savedNarrative?.days?.length && data.itineraries?.length) {
          const aiNarrative = data.itineraries.find(
            (i: {
              source: string
              status: string
              itinerary_json?: TripNarrative
            }) =>
              i.source === "ai" &&
              i.status === "active" &&
              i.itinerary_json?.days?.length
          )

          if (aiNarrative?.itinerary_json) {
            setTripNarrative(aiNarrative.itinerary_json)
            return
          }

          if (!isRetry) {
            retryTimeout = setTimeout(() => {
              void loadItineraries(true)
            }, 2000)
          }
        }
      } catch (error) {
        if (controller.signal.aborted || isCancelled) return
        console.error("Error loading itineraries:", error)
      }
    }

    void loadItineraries()

    return () => {
      isCancelled = true
      controller.abort()
      if (retryTimeout) clearTimeout(retryTimeout)
    }
  }, [tripId, userId, savedNarrative?.days?.length, setItineraryVersions, setActiveItineraryDays, setTripNarrative])

  useEffect(() => {
    if (autoGenerateOnMount && !tripNarrative && !narrativeLoading && hasSegments && itineraryVersions.length === 0 && !autoGenerateRef.current) {
      autoGenerateRef.current = true
      handleGenerateNarrative()
    }
  }, [autoGenerateOnMount, tripNarrative, narrativeLoading, hasSegments, itineraryVersions.length])

  return (
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
              disabled={narrativeLoading || !hasSegments}
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

      {!itineraryVersionsLoaded ? (
        <CardContent className="space-y-4">
          <div className="flex items-center justify-end gap-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-28" />
          </div>
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </CardContent>
      ) : (
        <CardContent className="space-y-4">
          {showVersionHistory && itineraryVersions.length > 0 && (
            <div className="rounded-2xl border border-muted/30 bg-muted/5 p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Version History</p>
              {itineraryVersions.map((v) => (
                <div
                  key={v.id}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${v.status === "active"
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
              <div className="rounded-2xl bg-primary/5 border border-primary/10 p-4">
                <p className="text-sm font-medium text-primary mb-1">Overview</p>
                <p className="text-sm">{tripNarrative.overview}</p>
              </div>

              {tripNarrative.days && tripNarrative.days.length > 0 && tripNarrative.days.slice(0, effectiveDayCount).map((day, idx) => {
                const seg = daySegments[idx]
                const allOpts = seg?.options && seg.options.length > 0
                  ? seg.options
                  : [...(seg?.verifiedStops ?? []), ...(seg?.otherStops ?? [])]
                const explicitId = selectedSegmentOptionIds[idx]
                const overnightStop = (explicitId ? allOpts.find((o) => o.id === explicitId) : undefined)
                  ?? seg?.recommendedOption
                  ?? allOpts[0]
                  ?? null
                return (
                  <div key={day.dayNumber} className="rounded-2xl bg-muted/5 border border-muted/20 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        {day.dayNumber}
                      </div>
                      <span className="text-sm font-semibold">Day {day.dayNumber}</span>
                    </div>

                    <p className="text-sm text-muted-foreground">{day.narrative}</p>

                    {overnightStop ? (
                      <div className="rounded-xl bg-background border border-muted/30 p-3 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{overnightStop.location_name}</span>
                          {(overnightStop.stay_type ?? overnightStop.route_type) && (
                            <span className="text-xs text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-full capitalize">
                              {overnightStop.stay_type ?? overnightStop.route_type}
                            </span>
                          )}
                        </div>
                        {overnightStop.why_stop_here && (
                          <p className="text-xs text-muted-foreground">{overnightStop.why_stop_here}</p>
                        )}
                        {overnightStop.aao_tip && (
                          <p className="text-xs text-primary/80 italic">&quot;{overnightStop.aao_tip}&quot;</p>
                        )}
                      </div>
                    ) : (
                      day.gapNote && (
                        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-800">
                          {day.gapNote}
                        </div>
                      )
                    )}

                    {day.aaoTips && day.aaoTips.length > 0 && (
                      <ul className="space-y-1">
                        {day.aaoTips.map((tip, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
                            {tip}
                          </li>
                        ))}
                      </ul>
                    )}

                    {day.fuelNote && (
                      <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 px-3 py-2 text-xs text-orange-800 flex items-start gap-2">
                        <Fuel className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        {day.fuelNote}
                      </div>
                    )}
                  </div>
                )
              })}

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
      )}
    </Card>
  )
}
