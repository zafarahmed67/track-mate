"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp, Fuel, Droplets, Star } from "lucide-react"

import type { TripStop } from "@/types/trip"

interface StopOption {
  id: string
  location_name: string
  stay_type?: string
  route_type?: string
  is_verified?: boolean
  is_recommended?: boolean
  source?: "database" | "google_places"
  distance_to_route_km?: number
  distance_from_start_km?: number
  water?: string
  pet_friendly?: string
  cost_band?: string
  why_stop_here?: string
  aao_tip?: string
  why_we_d_stay_again?: string
  region?: string
  state?: string
  latitude?: string
  longitude?: string
}

interface FuelStation {
  id?: string
  name: string
  address: string
  lat: number
  lng: number
  distanceFromStartKm?: number
}

interface TripDayByDayProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  daySegments: any[]
  expandedSegments: Set<number>
  activeSegmentIndex: number | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getMergedSegmentOptions: (segment: any, index: number, limit: number) => StopOption[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolvedDaySelections: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getSelectedOption: (segment: any, index: number) => StopOption | null | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getSelectedFuelSuggestion: (segment: any, index: number) => FuelStation | null | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getStopDistanceKm: (stop: any) => number | null
  tripStartLocationText: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  estimateSegmentDistance: (segment: any, index: number) => number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  estimateSegmentDuration: (segment: any, index: number) => number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getRegionLabel: (segment: any, index: number) => string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getFuelInfoForSegment: (segment: any, index: number) => FuelStation[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getFuelGapInfo: (segment: any, index: number) => { distanceIntoLeg?: number; lastGapExceeds?: boolean; nextGapExceeds?: boolean }
  getFuelStationKey: (station: FuelStation) => string
  getSegmentDayType: (distance: number) => string
  formatDistance: (km: number) => string
  formatDuration: (minutes: number) => string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleChooseSegmentOption: (segment: any, index: number, option: StopOption) => void
  toggleSegmentExpanded: (index: number) => void
  setActiveSegmentIndex: (index: number) => void
  handleChooseFuel: (index: number, fuelKey: string) => void
  stops: TripStop[]
}

export default function TripDayByDay({
  daySegments,
  expandedSegments,
  activeSegmentIndex,
  getMergedSegmentOptions,
  resolvedDaySelections,
  getSelectedOption,
  getSelectedFuelSuggestion,
  getStopDistanceKm,
  tripStartLocationText,
  estimateSegmentDistance,
  estimateSegmentDuration,
  getRegionLabel,
  getFuelInfoForSegment,
  getFuelGapInfo,
  getFuelStationKey,
  getSegmentDayType,
  formatDistance,
  formatDuration,
  handleChooseSegmentOption,
  toggleSegmentExpanded,
  setActiveSegmentIndex,
  handleChooseFuel,
  stops
}: TripDayByDayProps) {
  console.log("Rendering TripDayByDay with segments:", stops)
  return (
    <>
      {daySegments.map((segment, index) => {
        const distance = estimateSegmentDistance(segment, index)
        const duration = estimateSegmentDuration(segment, index)
        const region = getRegionLabel(segment, index)
        const fuelInfo = getFuelInfoForSegment(segment, index)
        const selectedOption = getSelectedOption(segment, index)
        const previousSelectedOption = index > 0 ? getSelectedOption(daySegments[index - 1], index - 1) : null
        const previousSelectedKm = index === 0
          ? 0
          : getStopDistanceKm(
            resolvedDaySelections.slice(0, index).findLast((stop) => getStopDistanceKm(stop) !== null)
          ) ?? segment.startKm
        const dayStartName = index === 0
          ? tripStartLocationText
          : (previousSelectedOption?.location_name || getRegionLabel(daySegments[index - 1], index - 1))
        const expanded = expandedSegments.has(index)
        const active = activeSegmentIndex === index

        const optionsToShow = getMergedSegmentOptions(segment, index, 12)
        const dayShownStopCount = optionsToShow.length
        console.log("optionsToShow:", optionsToShow);

        const selectedFuelSuggestion = getSelectedFuelSuggestion(segment, index)

        const stopsByDay: Record<number, Array<{ title: string; value: string }>> = {}

        stops.forEach((stop) => {
          if (typeof stop.day_index !== "number" || !stop.stop_id || !stop.location_name) {
            return
          }

          if (!stopsByDay[stop.day_index]) {
            stopsByDay[stop.day_index] = []
          }

          stopsByDay[stop.day_index].push({
            title: stop.location_name,
            value: stop.stop_id
          })
        })

        const dayOptions = Object.entries(stopsByDay).map(([dayIndex, options]) => ({
          day_title: `Day ${dayIndex}`,
          options
        }))

        console.log("Formatted Day Options:", dayOptions)

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
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {/* Overnight stop selector */}
                  <div className="rounded-3xl bg-muted/5 p-4 space-y-4">
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

                    {Array.isArray(optionsToShow) && optionsToShow.length > 0 ? (
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
                          const optionDayKm = typeof option.distance_from_start_km === "number"
                            ? Math.max(0, Math.round(option.distance_from_start_km - (previousSelectedKm ?? 0)))
                            : null
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
                              <div className="flex items-start gap-2.5">
                                <div className={[
                                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                                  isSelected ? "bg-primary text-primary-foreground"
                                    : isRecommended ? "bg-amber-400 text-white"
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
                                  {optionDayKm !== null && (
                                    <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                                      {optionDayKm} km to travel
                                    </p>
                                  )}
                                </div>
                              </div>

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

                  </div>

                  {/* Fuel planning */}
                  <div className="rounded-3xl bg-muted/5 p-4">
                    <div className="text-sm text-muted-foreground mb-3">Fuel planning</div>
                    {(() => {
                      const gapInfo = getFuelGapInfo(segment, index)
                      const hasFuelOptions = fuelInfo.length > 0
                      const warningParts = (segment.fuelWarning || "")
                        .split(" • ")
                        .filter((part: string) => {
                          if (!hasFuelOptions) return true
                          return !part.toLowerCase().includes("no fuel data available")
                        })
                        .filter((part: string) => part.trim().length > 0)

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
                                          onClick={() => handleChooseFuel(index, fuelKey)}
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
                              {warningParts.map((part: string, partIndex: number) => (
                                <div key={partIndex} className={partIndex > 0 ? "mt-1" : ""}>{part}</div>
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
              </CardContent>
            )}
          </Card>
        )
      })}
    </>
  )
}
