"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Download, Edit, Save, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"

interface TripHeaderProps {
  trip: {
    title: string
    start_location_text: string
    destination_text: string
    status: string
    travel_pace: string
  }
  tripId: string
  routeMeta: {
    drivingInfo?: { totalDistanceKm: number; totalDurationMinutes: number }
    segments?: unknown[]
  }
  saving: boolean
  onSaveTrip: () => void
  onExportPdf: () => void
  onDeleteClick: () => void
  computeEstimatedDays: () => number
  formatDistance: (km: number) => string
  formatDuration: (minutes: number) => string
  capitalize: (text: string) => string
}

export default function TripHeader({
  trip,
  tripId,
  routeMeta,
  saving,
  onSaveTrip,
  onExportPdf,
  onDeleteClick,
  computeEstimatedDays,
  formatDistance,
  formatDuration,
  capitalize,
}: TripHeaderProps) {
  const router = useRouter()

  return (
    <div className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-xl">
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
            <Button variant="outline" size="sm" onClick={onSaveTrip} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button variant="outline" size="sm" onClick={onExportPdf}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={onDeleteClick}>
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
  )
}