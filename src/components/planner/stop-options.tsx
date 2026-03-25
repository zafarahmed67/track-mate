"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Check, Plus, MapPin, Loader2, RefreshCw, Trash2, Fuel, Star, PawPrint, Waves } from "lucide-react"
import { toast } from "sonner"

interface StopOption {
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
  distance_from_start_km: number
  is_verified?: boolean
}

interface FuelStation {
  name: string
  lat: number
  lng: number
  address: string
}

interface StopOptionsProps {
  tripId: string
  startLat?: number
  startLng?: number
  destLat?: number
  destLng?: number
  travelPace?: string
  existingStopIds: string[]
  onAddStop: (stop: StopOption) => void
  onRemoveStop: (stopId: string) => void
}

export function StopOptions({
  tripId,
  startLat,
  startLng,
  destLat,
  destLng,
  travelPace = "moderate",
  existingStopIds,
  onAddStop,
  onRemoveStop,
}: StopOptionsProps) {
  const [options, setOptions] = useState<StopOption[]>([])
  const [fuelStations, setFuelStations] = useState<FuelStation[]>([])
  const [loading, setLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [showFuelStations, setShowFuelStations] = useState(true)

  const loadStopOptions = async () => {
    if (!startLat || !startLng || !destLat || !destLng) return

    setLoading(true)
    try {
      const response = await fetch("/api/stops/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startLat,
          startLng,
          destLat,
          destLng,
          travelPace,
        }),
      })
      const data = await response.json()

      if (data.success) {
        setOptions(data.options || [])
        setFuelStations(data.fuelStations || [])
      }
    } catch (error) {
      console.error("Error loading stop options:", error)
    } finally {
      setLoading(false)
      setHasLoaded(true)
    }
  }

  const isInTrip = (stopId: string) => existingStopIds.includes(stopId)

  const handleToggleStop = (stop: StopOption) => {
    if (isInTrip(stop.id)) {
      onRemoveStop(stop.id)
    } else {
      onAddStop(stop)
    }
  }

  const verifiedStops = options.filter(s => s.is_verified)
  const otherStops = options.filter(s => !s.is_verified)

  const paceLabels = {
    leisurely: "Leisurely (2hr, ~150km)",
    moderate: "Moderate (2.5hr, ~200km)",
    fast: "Fast (3.5hr, ~300km)",
  }

  return (
    <Card className="border-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Plan Your Route
            <Badge variant="outline" className="ml-2 text-xs">
              {paceLabels[travelPace as keyof typeof paceLabels] || paceLabels.moderate}
            </Badge>
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={loadStopOptions}
            disabled={loading || !startLat}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {hasLoaded ? "Refresh" : "Find Stops"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {!hasLoaded ? (
          <div className="text-center py-8 text-muted-foreground px-4">
            <MapPin className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Click "Find Stops" to see available stops along your route</p>
          </div>
        ) : loading ? (
          <div className="text-center py-8 text-muted-foreground">
            <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" />
            <p>Finding stops along route...</p>
          </div>
        ) : (
          <ScrollArea className="h-[600px]">
            <div className="p-4 space-y-6">
              {fuelStations.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium flex items-center gap-2">
                      <Fuel className="h-4 w-4 text-orange-500" />
                      Fuel Stops
                      <Badge variant="outline" className="text-xs">{fuelStations.length}</Badge>
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowFuelStations(!showFuelStations)}
                    >
                      {showFuelStations ? "Hide" : "Show"}
                    </Button>
                  </div>
                  {showFuelStations && (
                    <div className="grid grid-cols-1 gap-2">
                      {fuelStations.slice(0, 8).map((station, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 rounded-lg border bg-orange-50"
                        >
                          <div className="flex items-center gap-2">
                            <Fuel className="h-4 w-4 text-orange-500 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{station.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{station.address}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {verifiedStops.length > 0 && (
                <div>
                  <h3 className="font-medium flex items-center gap-2 mb-2">
                    <Star className="h-4 w-4 text-green-500" />
                    Verified RV Stops
                    <Badge className="bg-green-500 text-xs">{verifiedStops.length}</Badge>
                  </h3>
                  <div className="space-y-2">
                    {verifiedStops.slice(0, 15).map((stop, index) => {
                      const inTrip = isInTrip(stop.id)
                      return (
                        <div
                          key={stop.id}
                          className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                            inTrip
                              ? "bg-green-50 border-green-300"
                              : "bg-background hover:bg-muted/50"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                inTrip
                                  ? "bg-green-500 text-white"
                                  : "bg-green-100 text-green-700"
                              }`}
                            >
                              {inTrip ? <Check className="h-4 w-4" /> : index + 1}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{stop.location_name}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{stop.distance_from_start_km} km</span>
                                {stop.state && <span>• {stop.state}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {stop.tier && (
                              <Badge variant="outline" className="text-xs">
                                ★ {stop.tier}
                              </Badge>
                            )}
                            {stop.pet_friendly === "yes" && (
                              <Badge className="bg-green-500 text-xs"><PawPrint className="h-3 w-3" /></Badge>
                            )}
                            {stop.water === "yes" && (
                              <Badge className="bg-blue-500 text-xs"><Waves className="h-3 w-3" /></Badge>
                            )}
                            {inTrip ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => handleToggleStop(stop)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleToggleStop(stop)}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {otherStops.length > 0 && (
                <div>
                  <h3 className="font-medium flex items-center gap-2 mb-2">
                    <MapPin className="h-4 w-4 text-blue-500" />
                    Other Stops & Attractions
                    <Badge variant="outline" className="text-xs">{otherStops.length}</Badge>
                  </h3>
                  <div className="space-y-2">
                    {otherStops.slice(0, 15).map((stop, index) => {
                      const inTrip = isInTrip(stop.id)
                      return (
                        <div
                          key={stop.id}
                          className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                            inTrip
                              ? "bg-blue-50 border-blue-300"
                              : "bg-background hover:bg-muted/50"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                inTrip
                                  ? "bg-blue-500 text-white"
                                  : "bg-blue-100 text-blue-700"
                              }`}
                            >
                              {inTrip ? <Check className="h-4 w-4" /> : index + 1}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{stop.location_name}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{stop.distance_from_start_km} km</span>
                                {stop.state && <span>• {stop.state}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {inTrip ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => handleToggleStop(stop)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleToggleStop(stop)}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {options.length === 0 && fuelStations.length === 0 && (
                <div className="text-center py-8 text-muted-foreground px-4">
                  <p>No stops found along this route</p>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
