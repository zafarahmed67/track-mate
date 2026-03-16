"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ChevronDown, ChevronUp, MapPin, Navigation, PawPrint, Waves } from "lucide-react"
import type { Stop } from "@/lib/types"

interface TripStopsProps {
  stops: Stop[]
  onRemove?: (stopId: string) => void
  onReorder?: (stops: Stop[]) => void
}

export function TripStops({ stops, onRemove, onReorder }: TripStopsProps) {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set())

  const toggleItem = (id: string) => {
    setOpenItems((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  if (stops.length === 0) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-xl">Planned Stops</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No stops planned yet. Submit your trip details to generate a route plan.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-xl">Planned Stops ({stops.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-3">
            {stops.map((stop, index) => {
              const isOpen = openItems.has(stop.id)
              return (
                <Collapsible
                  key={stop.id}
                  open={isOpen}
                  onOpenChange={() => toggleItem(stop.id)}
                >
                  <div className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                          {index + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">{stop.location_name}</h4>
                            {stop.tier && (
                              <Badge variant="secondary" className="text-xs">
                                {stop.tier}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {stop.nearest_town}, {stop.state}
                          </p>
                        </div>
                      </div>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm">
                          {isOpen ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                    </div>

                    <CollapsibleContent>
                      <div className="mt-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span>Region: {stop.region}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Navigation className="h-4 w-4 text-muted-foreground" />
                            <span>{stop.route_type}</span>
                          </div>
                          {stop.pet_friendly === "yes" && (
                            <div className="flex items-center gap-2">
                              <PawPrint className="h-4 w-4 text-muted-foreground" />
                              <span>Pet Friendly</span>
                            </div>
                          )}
                          {stop.water === "yes" && (
                            <div className="flex items-center gap-2">
                              <Waves className="h-4 w-4 text-muted-foreground" />
                              <span>Water Available</span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {stop.road_suitability && (
                            <Badge variant="outline" className="text-xs">
                              {stop.road_suitability}
                            </Badge>
                          )}
                          {stop.cost_band && (
                            <Badge variant="outline" className="text-xs">
                              {stop.cost_band}
                            </Badge>
                          )}
                          {stop.stay_type && (
                            <Badge variant="outline" className="text-xs">
                              {stop.stay_type}
                            </Badge>
                          )}
                        </div>

                        {stop.why_stop_here && (
                          <p className="text-sm text-muted-foreground">
                            <span className="font-medium">Why stop here:</span>{" "}
                            {stop.why_stop_here}
                          </p>
                        )}

                        {stop.aao_tip && (
                          <div className="rounded-md bg-muted p-3 text-sm">
                            <span className="font-medium">AAO Tip:</span> {stop.aao_tip}
                          </div>
                        )}

                        {onRemove && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => onRemove(stop.id)}
                          >
                            Remove Stop
                          </Button>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              )
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
