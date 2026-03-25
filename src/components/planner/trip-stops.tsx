"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  ChevronDown,
  ChevronUp,
  MapPin,
  PawPrint,
  Waves,
  Star,
  Info,
  Route,
  GripVertical,
} from "lucide-react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { Stop } from "@/lib/types"

interface TripStopsProps {
  stops: Stop[]
  selectedStops?: string[]
  onSelect?: (stopId: string, selected: boolean) => void
  onSelectAll?: (selected: boolean) => void
  onRemove?: (stopId: string) => void
  onReorder?: (stops: Stop[]) => void
  editable?: boolean
}

interface SortableStopProps {
  stop: Stop
  index: number
  stops: Stop[]
  selectedStops: string[]
  isOpen: boolean
  onToggle: () => void
  onSelect: (stopId: string, selected: boolean) => void
  onRemove?: (stopId: string) => void
  editable: boolean
}

function SortableStop({
  stop,
  index,
  stops,
  selectedStops,
  isOpen,
  onToggle,
  onSelect,
  onRemove,
  editable,
}: SortableStopProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stop.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  }

  const isSelected = (stopId: string) => selectedStops.includes(stopId)

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <Collapsible
        open={isOpen}
        onOpenChange={onToggle}
      >
        <div className="relative overflow-hidden rounded-xl border-2 transition-all duration-200 hover:border-primary/30 bg-background">
          {editable && (
            <div
              {...attributes}
              {...listeners}
              className="absolute left-0 top-0 bottom-0 w-8 flex items-center justify-center cursor-grab bg-muted/50 hover:bg-muted z-10 rounded-l-xl"
            >
              <GripVertical className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/20" />

          <div className={`pl-4 pr-4 py-4 ${editable ? "pl-12" : ""}`}>
            {editable && onSelect && (
              <div className="mb-3 flex items-center gap-2">
                <Checkbox
                  checked={isSelected(stop.id)}
                  onCheckedChange={(checked) =>
                    onSelect(stop.id, checked === true)
                  }
                  id={`select-${stop.id}`}
                />
                <label
                  htmlFor={`select-${stop.id}`}
                  className="text-sm cursor-pointer select-none"
                >
                  {isSelected(stop.id) ? "Selected" : "Select this stop"}
                </label>
              </div>
            )}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-4">
                <div className="relative">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-lg">
                    {index + 1}
                  </div>
                  {index < stops.length - 1 && (
                    <div className="absolute left-1/2 -translate-x-1/2 top-full h-6 w-0.5 bg-border" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-base truncate">
                      {stop.location_name}
                    </h4>
                    {stop.tier && (
                      <Badge
                        variant="outline"
                        className="text-xs shrink-0 bg-primary/5 border-primary/20"
                      >
                        <Star className="h-3 w-3 mr-1" />
                        {stop.tier}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {stop.nearest_town}, {stop.state}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {stop.route_type && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-muted">
                        <Route className="h-3 w-3" />
                        {stop.route_type}
                      </span>
                    )}
                    {stop.pet_friendly === "yes" && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-muted">
                        <PawPrint className="h-3 w-3" />
                        Pet Friendly
                      </span>
                    )}
                    {stop.water === "yes" && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-muted">
                        <Waves className="h-3 w-3" />
                        Water
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-8 w-8"
                >
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>

            {editable && onRemove && (
              <div className="flex gap-2 mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRemove(stop.id)}
                  className="flex-1 h-8 text-destructive hover:bg-destructive/10"
                  title="Remove stop"
                >
                  Remove Stop
                </Button>
              </div>
            )}
          </div>

          <CollapsibleContent>
            <div className="mt-5 pt-5 border-t space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Region
                  </p>
                  <p className="text-sm font-medium">
                    {stop.region || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Route Type
                  </p>
                  <p className="text-sm font-medium">
                    {stop.route_type || "N/A"}
                  </p>
                </div>
              </div>

              {stop.road_suitability && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Road Suitability
                  </p>
                  <Badge
                    variant="outline"
                    className="bg-primary/5 border-primary/20"
                  >
                    {stop.road_suitability}
                  </Badge>
                </div>
              )}

              {stop.cost_band && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Cost Band
                  </p>
                  <Badge
                    variant="outline"
                    className="bg-primary/5 border-primary/20"
                  >
                    {stop.cost_band}
                  </Badge>
                </div>
              )}

              {stop.stay_type && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Stay Type
                  </p>
                  <Badge
                    variant="outline"
                    className="bg-primary/5 border-primary/20"
                  >
                    {stop.stay_type}
                  </Badge>
                </div>
              )}

              {stop.why_stop_here && (
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">
                      Why stop here
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {stop.why_stop_here}
                  </p>
                </div>
              )}

              {stop.aao_tip && (
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Star className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">
                      AAO Tip
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {stop.aao_tip}
                  </p>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  )
}

export function TripStops({
  stops,
  selectedStops = [],
  onSelect,
  onSelectAll,
  onRemove,
  onReorder,
  editable = false,
}: TripStopsProps) {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set())

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const allSelected = stops.length > 0 && selectedStops.length === stops.length
  const someSelected = selectedStops.length > 0 && selectedStops.length < stops.length

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = stops.findIndex((s) => s.id === active.id)
      const newIndex = stops.findIndex((s) => s.id === over.id)
      const newStops = arrayMove(stops, oldIndex, newIndex)
      onReorder?.(newStops)
    }
  }

  const isSelected = (stopId: string) => selectedStops.includes(stopId)

  if (stops.length === 0) {
    return (
      <Card className="border-2">
        <CardContent className="p-8 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Route className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No stops planned yet</h3>
          <p className="text-muted-foreground text-sm">
            Submit your trip details to generate a route plan with verified
            stops.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-2">
      <div className="bg-muted/30 px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">Planned Stops</h2>
              <p className="text-sm text-muted-foreground">
                {stops.length} location{stops.length !== 1 ? "s" : ""} on your
                route
              </p>
            </div>
          </div>
          {editable && onSelectAll && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSelectAll(!allSelected)}
              className="gap-2"
            >
              <Checkbox
                checked={allSelected}
                className="h-4 w-4"
                onCheckedChange={() => onSelectAll(!allSelected)}
              />
              {someSelected ? "Select All" : allSelected ? "Deselect All" : "Select All"}
            </Button>
          )}
          <Badge variant="outline" className="bg-primary/5 border-primary/20">
            {stops.length} stops
          </Badge>
        </div>
      </div>
      <CardContent className="p-0">
        <ScrollArea className="h-[520px]">
          <div className="p-4 space-y-3">
            {editable ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={stops.map(s => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {stops.map((stop, index) => (
                    <SortableStop
                      key={stop.id}
                      stop={stop}
                      index={index}
                      stops={stops}
                      selectedStops={selectedStops}
                      isOpen={openItems.has(stop.id)}
                      onToggle={() => toggleItem(stop.id)}
                      onSelect={onSelect!}
                      onRemove={onRemove}
                      editable={editable}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            ) : (
              stops.map((stop, index) => (
                <SortableStop
                  key={stop.id}
                  stop={stop}
                  index={index}
                  stops={stops}
                  selectedStops={selectedStops}
                  isOpen={openItems.has(stop.id)}
                  onToggle={() => toggleItem(stop.id)}
                  onSelect={onSelect!}
                  onRemove={onRemove}
                  editable={editable}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
