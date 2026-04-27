"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { useCallback, useEffect, useState, useRef, type Dispatch, type SetStateAction } from "react"
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

import {
  TripNarrative
} from '@/types/trip'

interface ItineraryVersion {
  id: string
  version: number
  status: string
  model_name: string | null
  created_at: string
}

interface ItinerariesResponse {
  success: boolean
  totalVersions?: string[]
  activeVersion?: string | null
  data?: TripNarrative | null
  itineraries?: ItineraryVersion[]
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
  tripNarrative?: TripNarrative | null
  setTripNarrative?: Dispatch<SetStateAction<TripNarrative | null>>
  hasSegments: boolean
  effectiveDayCount: number
  daySegments: DaySegment[]
  selectedSegmentOptionIds: Record<number, string>
  trip: TripData
  tripId: string
  userId: string | null
  setActiveItineraryDays: Dispatch<SetStateAction<ActiveItineraryDayRow[]>>
  savedNarrative?: TripNarrative | null
  autoGenerateOnMount?: boolean
  initialVersionsLoaded?: boolean
}

interface TripNarratives {
  totalVersions: string[]
  activeVersion: string | null
  data: TripNarrative | null
}

export default function TripTrackMateOverview({
  tripNarrative: incomingTripNarrative,
  setTripNarrative: incomingSetTripNarrative,
  hasSegments,
  effectiveDayCount,
  daySegments,
  selectedSegmentOptionIds,
  trip,
  tripId,
  userId,
  setActiveItineraryDays,
  savedNarrative,
  autoGenerateOnMount = false,
  initialVersionsLoaded = false,
}: TripTrackMateOverviewProps) {
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [narrativeLoading, setNarrativeLoading] = useState(false)
  const [narrative, setNarrative] = useState<TripNarratives | null>(null)
  const [tripNarrativeLocal, setTripNarrativeLocal] = useState<TripNarrative | null>(incomingTripNarrative ?? savedNarrative ?? null)
  const autoGenerateRef = useRef(false)
  const [itineraryVersionsLoaded, setItineraryVersionsLoaded] = useState(initialVersionsLoaded)
  const [restoringVersion, setRestoringVersion] = useState<string | null>(null);
  const [itineraryVersions, setItineraryVersions] = useState<Array<{ id: string; version: number; status: string; model_name: string | null; created_at: string }>>([])

  const setTripNarrativeState = incomingSetTripNarrative ?? setTripNarrativeLocal
  const tripNarrativeState = incomingTripNarrative ?? tripNarrativeLocal

  const fetchItineraries = useCallback(async () => {
    if (!userId) return

    try {
      const itinerariesResponse = await fetch(`/api/trips/${tripId}/itineraries?user_id=${userId}`)
      if (!itinerariesResponse.ok) {
        throw new Error(`Failed to fetch itineraries: ${itinerariesResponse.status}`)
      }

      const itinerariesData: ItinerariesResponse = await itinerariesResponse.json()
      if (!itinerariesData.success) return

      const totalVersions = Array.isArray(itinerariesData.totalVersions) ? itinerariesData.totalVersions : []
      const activeVersion = typeof itinerariesData.activeVersion === "string" ? itinerariesData.activeVersion : null
      const activeNarrative = itinerariesData.data && Array.isArray(itinerariesData.data.days)
        ? itinerariesData.data
        : null

      setNarrative({
        totalVersions,
        activeVersion,
        data: activeNarrative,
      })
      const versions = Array.isArray(itinerariesData.itineraries) ? itinerariesData.itineraries : []
      setItineraryVersions(versions)
      setActiveItineraryDays([])
      setItineraryVersionsLoaded(true)

      if (activeNarrative?.days?.length) {
        setTripNarrativeState(activeNarrative)
      }
    } catch (error) {
      console.error("Error loading itineraries:", error)
    }
  }, [tripId, userId, setActiveItineraryDays, setItineraryVersions, setTripNarrativeState])

  useEffect(() => {
    void fetchItineraries()
  }, [fetchItineraries])

  const handleGenerateNarrative = async () => {
    if (!trip || !userId) return
    setNarrativeLoading(true)
    try {
      const response = await fetch(`/api/trips/${tripId}/itineraries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })

      console.log("Narrative generation response", response)

      const result = await response.json()
      if (result.success) {
        setTripNarrativeState(result.narrative)
        toast.success("TrackMate Overview generated and saved")
        void fetchItineraries()
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
        setTripNarrativeState(result.narrative as TripNarrative)
        setItineraryVersions((prev) =>
          prev.map((v) => ({ ...v, status: v.id === itineraryId ? "active" : "superseded" }))
        )
        setNarrative((prev) => {
          const restored = itineraryVersions.find((v) => v.id === itineraryId)
          if (!prev || !restored) return prev
          return {
            ...prev,
            activeVersion: `v${restored.version}`,
            data: result.narrative as TripNarrative,
          }
        })
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
    if (autoGenerateOnMount && !tripNarrativeState && !narrativeLoading && hasSegments && itineraryVersionsLoaded && !autoGenerateRef.current) {
      autoGenerateRef.current = true
      void handleGenerateNarrative()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerateOnMount, tripNarrativeState, narrativeLoading, hasSegments, itineraryVersionsLoaded])

  useEffect(() => {
    const versionCount = narrative?.totalVersions.length ?? 0
    if (!itineraryVersionsLoaded || !hasSegments || narrativeLoading || autoGenerateRef.current) return
    if (versionCount === 0) {
      autoGenerateRef.current = true
      void handleGenerateNarrative()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrative?.totalVersions.length, itineraryVersionsLoaded, hasSegments, narrativeLoading])

  const activeNarrativeData = narrative?.data ?? tripNarrativeState ?? null

  return (
    <Card className="border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            TrackMate Overview
            {narrative?.activeVersion && (
              <span className="text-xs font-normal text-muted-foreground">
                {narrative.activeVersion}
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {itineraryVersions.length > 0 && (
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
              disabled={narrativeLoading}
            >
              {narrativeLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2">{narrativeLoading ? "Generating..." : activeNarrativeData ? "Regenerate" : "Generate"}</span>
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

          {!activeNarrativeData && !narrativeLoading && (
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

          {activeNarrativeData && !narrativeLoading && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-primary/5 border border-primary/10 p-4">
                <p className="text-sm font-medium text-primary mb-1">Overview</p>
                <p className="text-sm">{activeNarrativeData.overview}</p>
              </div>

              {activeNarrativeData.days && activeNarrativeData.days.length > 0 && activeNarrativeData.days.slice(0, effectiveDayCount).map((day, idx) => {
                const seg = daySegments[idx]
                const allOpts = seg?.options && seg.options.length > 0
                  ? seg.options
                  : [...(seg?.verifiedStops ?? []), ...(seg?.otherStops ?? [])]
                const explicitId = selectedSegmentOptionIds[idx]
                const overnightStop = (explicitId ? allOpts.find((o) => o.id === explicitId) : undefined)
                  ?? seg?.recommendedOption
                  ?? allOpts[0]
                  ?? null
                const narrativeSuggestedStay = day.suggestedStay
                const displayStayName = narrativeSuggestedStay?.name ?? overnightStop?.location_name ?? null
                const displayStayType = narrativeSuggestedStay?.stopType ?? overnightStop?.stay_type ?? overnightStop?.route_type ?? null
                const displayWhyStopHere = narrativeSuggestedStay?.whyStopHere ?? overnightStop?.why_stop_here ?? null
                const displayAaoTip = narrativeSuggestedStay?.aaoTip ?? overnightStop?.aao_tip ?? null
                return (
                  <div key={day.dayNumber} className="rounded-2xl bg-muted/5 border border-muted/20 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        {day.dayNumber}
                      </div>
                      <span className="text-sm font-semibold">Day {day.dayNumber}</span>
                    </div>

                    <p className="text-sm text-muted-foreground">{day.narrative}</p>

                    {displayStayName ? (
                      <div className="rounded-xl bg-background border border-muted/30 p-3 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{displayStayName}</span>
                          {displayStayType && (
                            <span className="text-xs text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-full capitalize">
                              {displayStayType}
                            </span>
                          )}
                        </div>
                        {displayWhyStopHere && (
                          <p className="text-xs text-muted-foreground">{displayWhyStopHere}</p>
                        )}
                        {displayAaoTip && (
                          <p className="text-xs text-primary/80 italic">&quot;{displayAaoTip}&quot;</p>
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

              {activeNarrativeData.tripNotes && (activeNarrativeData.tripNotes.fuelGuidance || activeNarrativeData.tripNotes.remoteWarnings || activeNarrativeData.tripNotes.roadConditions) && (
                <div className="rounded-2xl bg-muted/5 border border-muted/20 p-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Trip Notes</p>
                  {activeNarrativeData.tripNotes.fuelGuidance && (
                    <p className="text-xs text-muted-foreground flex items-start gap-2">
                      <Fuel className="h-3.5 w-3.5 mt-0.5 shrink-0 text-orange-500" />
                      {activeNarrativeData.tripNotes.fuelGuidance}
                    </p>
                  )}
                  {activeNarrativeData.tripNotes.remoteWarnings && (
                    <p className="text-xs text-muted-foreground flex items-start gap-2">
                      <Route className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                      {activeNarrativeData.tripNotes.remoteWarnings}
                    </p>
                  )}
                  {activeNarrativeData.tripNotes.roadConditions && (
                    <p className="text-xs text-muted-foreground flex items-start gap-2">
                      <Caravan className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                      {activeNarrativeData.tripNotes.roadConditions}
                    </p>
                  )}
                </div>
              )}

              <p className="text-xs text-muted-foreground text-right">
                Generated {new Date(activeNarrativeData.generatedAt || new Date()).toLocaleString("en-AU")}
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
