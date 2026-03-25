"use client"

import { useState, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  ChevronDown,
  ChevronUp,
  Filter,
  X,
  MapPin,
  Dog,
  Truck,
} from "lucide-react"
import type { Stop } from "@/lib/types"

interface TripStop extends Stop {
  distance_to_route_km?: number
}

interface StopFiltersProps {
  stops: TripStop[]
  onFilterChange: (filteredStops: TripStop[]) => void
}

function getDistanceRange(stops: TripStop[]) {
  const distances = stops
    .map((s) => s.distance_to_route_km)
    .filter((d): d is number => d !== undefined && d !== null)
  
  if (distances.length === 0) return { min: 0, max: 100 }
  
  const min = Math.floor(Math.min(...distances))
  const max = Math.ceil(Math.max(...distances))
  
  return { min, max }
}

interface FilterState {
  maxDistance: number
  rigSuitability: string[]
  petFriendly: boolean | null
  roadType: string[]
  costBand: string[]
  stayType: string[]
}

const RIG_SUITABILITY_OPTIONS = ["2wd", "4wd", "all"]
const ROAD_TYPE_OPTIONS = ["sealed", "gravel", "4wd"]
const COST_BAND_OPTIONS = ["budget", "moderate", "premium"]
const STAY_TYPE_OPTIONS = ["campground", "caravan_park", "rest_area", "free"]

const DEFAULT_FILTERS: FilterState = {
  maxDistance: 50,
  rigSuitability: [],
  petFriendly: null,
  roadType: [],
  costBand: [],
  stayType: [],
}

export function StopFilters({ stops, onFilterChange }: StopFiltersProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeFiltersCount, setActiveFiltersCount] = useState(0)
  
  const distanceRange = useMemo(() => getDistanceRange(stops), [stops])
  
  const defaultFilters = useMemo<FilterState>(() => ({
    ...DEFAULT_FILTERS,
    maxDistance: distanceRange.max,
  }), [distanceRange.max])
  
  const [currentFilters, setCurrentFilters] = useState<FilterState>(defaultFilters)
  const [appliedFilters, setAppliedFilters] = useState<FilterState | null>(null)

  const hasActiveFilters = appliedFilters !== null

  const applyFilters = () => {
    setAppliedFilters(currentFilters)
    const filtered = stops.filter((stop) => {
      if (
        stop.distance_to_route_km !== undefined &&
        stop.distance_to_route_km > currentFilters.maxDistance
      ) {
        return false
      }

      if (currentFilters.rigSuitability.length > 0) {
        const stopRig = stop.rig_suitability?.toLowerCase()
        if (!stopRig) return false
        const match = currentFilters.rigSuitability.some(
          (rig) => stopRig === rig || stopRig === "all"
        )
        if (!match) return false
      }

      if (currentFilters.petFriendly !== null) {
        if (stop.pet_friendly?.toLowerCase() !== (currentFilters.petFriendly ? "yes" : "no")) {
          return false
        }
      }

      if (currentFilters.roadType.length > 0) {
        const stopRoad = stop.road_suitability?.toLowerCase()
        if (!stopRoad) return false
        const match = currentFilters.roadType.some(
          (road) => stopRoad.includes(road) || road === "sealed" && stopRoad === "sealed"
        )
        if (!match) return false
      }

      if (currentFilters.costBand.length > 0) {
        const stopCost = stop.cost_band?.toLowerCase()
        if (!stopCost) return false
        if (!currentFilters.costBand.includes(stopCost)) return false
      }

      if (currentFilters.stayType.length > 0) {
        const stopStay = stop.stay_type?.toLowerCase().replace(" ", "_")
        if (!stopStay) return false
        const match = currentFilters.stayType.some(
          (stay) => stopStay.includes(stay) || stay === "rest_area" && stopStay === "rest stop"
        )
        if (!match) return false
      }

      return true
    })
    onFilterChange(filtered)
  }

  const showAllStops = () => {
    setAppliedFilters(null)
    setCurrentFilters(defaultFilters)
    setActiveFiltersCount(0)
    onFilterChange(stops)
  }

  const updateFilterCount = (newFilters: FilterState, range: { min: number; max: number }) => {
    let count = 0
    if (newFilters.maxDistance < range.max) count++
    if (newFilters.rigSuitability.length > 0) count++
    if (newFilters.petFriendly !== null) count++
    if (newFilters.roadType.length > 0) count++
    if (newFilters.costBand.length > 0) count++
    if (newFilters.stayType.length > 0) count++
    setActiveFiltersCount(count)
  }

  const handleFilterChange = (key: keyof FilterState, value: unknown) => {
    const newFilters = { ...currentFilters, [key]: value }
    setCurrentFilters(newFilters)
    updateFilterCount(newFilters, distanceRange)
  }

  const appliedFilteredCount = useMemo(() => {
    if (!appliedFilters) return stops.length
    return stops.filter((stop) => {
      if (
        stop.distance_to_route_km !== undefined &&
        stop.distance_to_route_km > appliedFilters.maxDistance
      ) {
        return false
      }
      if (appliedFilters.rigSuitability.length > 0) {
        const stopRig = stop.rig_suitability?.toLowerCase()
        if (!stopRig) return false
        const match = appliedFilters.rigSuitability.some(
          (rig) => stopRig === rig || stopRig === "all"
        )
        if (!match) return false
      }
      if (appliedFilters.petFriendly !== null) {
        if (stop.pet_friendly?.toLowerCase() !== (appliedFilters.petFriendly ? "yes" : "no")) {
          return false
        }
      }
      if (appliedFilters.roadType.length > 0) {
        const stopRoad = stop.road_suitability?.toLowerCase()
        if (!stopRoad) return false
        const match = appliedFilters.roadType.some(
          (road) => stopRoad.includes(road) || road === "sealed" && stopRoad === "sealed"
        )
        if (!match) return false
      }
      if (appliedFilters.costBand.length > 0) {
        const stopCost = stop.cost_band?.toLowerCase()
        if (!stopCost) return false
        if (!appliedFilters.costBand.includes(stopCost)) return false
      }
      if (appliedFilters.stayType.length > 0) {
        const stopStay = stop.stay_type?.toLowerCase().replace(" ", "_")
        if (!stopStay) return false
        const match = appliedFilters.stayType.some(
          (stay) => stopStay.includes(stay) || stay === "rest_area" && stopStay === "rest stop"
        )
        if (!match) return false
      }
      return true
    }).length
  }, [stops, appliedFilters])

  return (
    <Card className="border-2">
      <div className="bg-muted/30 px-6 pb-4 border-b">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Filter Stops</h2>
          <div className="flex items-center gap-2">
            <Button
              variant={hasActiveFilters ? "outline" : "default"}
              size="sm"
              onClick={showAllStops}
            >
              Show All ({stops.length})
            </Button>
            {hasActiveFilters && (
              <Badge variant="secondary">
                {appliedFilteredCount} of {stops.length}
              </Badge>
            )}
          </div>
        </div>
      </div>

<div className="px-6 pb-6 space-y-6">
              <div className="flex justify-end">
                {activeFiltersCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCurrentFilters(DEFAULT_FILTERS)
                      setActiveFiltersCount(0)
                    }}
                    className="text-muted-foreground"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear all
                  </Button>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <h3 className="font-medium">Corridor Filtering</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Select only stops that lie close to the actual route between
                  start and destination.
                </p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <Label>Max distance from route</Label>
                    <span className="text-primary font-medium">
                      {currentFilters.maxDistance} km
                    </span>
                  </div>
                  <Slider
                    value={[currentFilters.maxDistance]}
                    onValueChange={([value]) =>
                      handleFilterChange("maxDistance", value)
                    }
                    max={distanceRange.max}
                    step={5}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{distanceRange.min} km</span>
                    <span>{Math.round(distanceRange.max / 2)} km</span>
                    <span>{distanceRange.max} km</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-primary" />
                  <h3 className="font-medium">Suitability Filtering</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Narrow stops further based on your preferences and constraints.
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-3">
                    <Label className="text-sm">Rig Suitability</Label>
                    <div className="flex flex-wrap gap-2">
                      {RIG_SUITABILITY_OPTIONS.map((rig) => (
                        <label
                          key={rig}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <Checkbox
                            checked={currentFilters.rigSuitability.includes(rig)}
                            onCheckedChange={(checked) => {
                              const newRig = checked
                                ? [...currentFilters.rigSuitability, rig]
                                : currentFilters.rigSuitability.filter((r) => r !== rig)
                              handleFilterChange("rigSuitability", newRig)
                            }}
                          />
                          <span className="capitalize">{rig}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-sm">Pet Friendly</Label>
                    <div className="flex gap-2">
                      <Button
                        variant={
                          currentFilters.petFriendly === true ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() =>
                          handleFilterChange(
                            "petFriendly",
                            currentFilters.petFriendly === true ? null : true
                          )
                        }
                      >
                        <Dog className="h-4 w-4 mr-1" />
                        Yes
                      </Button>
                      <Button
                        variant={
                          currentFilters.petFriendly === false ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() =>
                          handleFilterChange(
                            "petFriendly",
                            currentFilters.petFriendly === false ? null : false
                          )
                        }
                      >
                        No
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-sm">Road Type</Label>
                    <div className="flex flex-wrap gap-2">
                      {ROAD_TYPE_OPTIONS.map((road) => (
                        <label
                          key={road}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <Checkbox
                            checked={currentFilters.roadType.includes(road)}
                            onCheckedChange={(checked) => {
                              const newRoads = checked
                                ? [...currentFilters.roadType, road]
                                : currentFilters.roadType.filter((r) => r !== road)
                              handleFilterChange("roadType", newRoads)
                            }}
                          />
                          <span className="capitalize">{road}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-sm">Cost Band</Label>
                    <div className="flex flex-wrap gap-2">
                      {COST_BAND_OPTIONS.map((cost) => (
                        <label
                          key={cost}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <Checkbox
                            checked={currentFilters.costBand.includes(cost)}
                            onCheckedChange={(checked) => {
                              const newCosts = checked
                                ? [...currentFilters.costBand, cost]
                                : currentFilters.costBand.filter((c) => c !== cost)
                              handleFilterChange("costBand", newCosts)
                            }}
                          />
                          <span className="capitalize">{cost}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 sm:col-span-2">
                    <Label className="text-sm">Stay Type</Label>
                    <div className="flex flex-wrap gap-2">
                      {STAY_TYPE_OPTIONS.map((stay) => (
                        <label
                          key={stay}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <Checkbox
                            checked={currentFilters.stayType.includes(stay)}
                            onCheckedChange={(checked) => {
                              const newStays = checked
                                ? [...currentFilters.stayType, stay]
                                : currentFilters.stayType.filter((s) => s !== stay)
                              handleFilterChange("stayType", newStays)
                            }}
                          />
                          <span className="capitalize">
                            {stay.replace("_", " ")}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t">
                <Button
                  onClick={applyFilters}
                  className="w-full"
                  disabled={activeFiltersCount === 0}
                >
                  Apply Filters
                </Button>
              </div>
            </div>
    </Card>
  )
}