"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Fuel, RefreshCw, Plus, X, MapPin, Navigation, Clock, Gauge, PawPrint, Waves, Star, Info, ChevronDown, ChevronUp, Trash2 } from "lucide-react"

interface FuelStation {
  id: string
  name: string
  lat: number
  lng: number
  address: string
  isOpenNow?: boolean
  rating?: number
}

interface TripPlannerUIProps {
  trip: {
    start_location_text?: string
    destination_text?: string
    start_lat?: number
    start_lng?: number
    destination_lat?: number
    destination_lng?: number
  }
  stops: Array<{
    id: string
    location_name: string
    nearest_town?: string
    state?: string
    tier?: string
    route_type?: string
    pet_friendly?: string
    water?: string
    road_suitability?: string
    cost_band?: string
    stay_type?: string
    why_stop_here?: string
    aao_tip?: string
    latitude?: string
    longitude?: string
  }>
  fuelStations: FuelStation[]
  onLoadFuelStations: () => void
  onAddFuelStation: (station: FuelStation) => void
  onRemoveFuelStation: (id: string) => void
  onRemoveStop: (id: string) => void
  fuelLoading?: boolean
}

export function TripPlannerUI({
  trip,
  stops,
  fuelStations,
  onLoadFuelStations,
  onAddFuelStation,
  onRemoveFuelStation,
  onRemoveStop,
  fuelLoading,
}: TripPlannerUIProps) {
  const [expandedStops, setExpandedStops] = useState<Set<string>>(new Set())

  const toggleStop = (id: string) => {
    setExpandedStops((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (

      <div className="space-y-6">
        <Card className="border-2">
          <CardHeader className="">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Planned Stops
              </CardTitle>
              <Badge variant="outline">{stops.length} stops</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-146.25">
              <div className="p-4 space-y-3">
                {stops.map((stop, index) => {
                  const isExpanded = expandedStops.has(stop.id)
                  
                  return (
                    <div
                      key={stop.id}
                      className="rounded-xl border-2 overflow-hidden"
                    >
                      <div 
                        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleStop(stop.id)}
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{stop.location_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {stop.nearest_town}, {stop.state}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            onRemoveStop(stop.id)
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      
                      {isExpanded && (
                        <div className="p-3 pt-0 border-t bg-muted/30">
                          <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                            {stop.route_type && (
                              <div>
                                <span className="text-muted-foreground">Type:</span> {stop.route_type}
                              </div>
                            )}
                            {stop.cost_band && (
                              <div>
                                <span className="text-muted-foreground">Cost:</span> {stop.cost_band}
                              </div>
                            )}
                            {stop.road_suitability && (
                              <div className="col-span-2">
                                <span className="text-muted-foreground">Road:</span> {stop.road_suitability}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {stop.tier && (
                              <Badge className="text-xs bg-yellow-500">★ Tier {stop.tier}</Badge>
                            )}
                            {stop.pet_friendly === "yes" && (
                              <Badge className="text-xs bg-green-500">Pets</Badge>
                            )}
                            {stop.water === "yes" && (
                              <Badge className="text-xs bg-blue-500">Water</Badge>
                            )}
                          </div>
                          {stop.why_stop_here && (
                            <p className="text-xs text-muted-foreground mt-2">{stop.why_stop_here}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
  )
}
