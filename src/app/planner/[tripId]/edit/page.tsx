"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { getStoredUser } from "@/lib/auth"
import type { Trip, TravelPace } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function EditTripPage() {
  const params = useParams<{ tripId: string }>()
  const router = useRouter()
  const tripId = params.tripId

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState("")
  const [tripDurationDays, setTripDurationDays] = useState(7)
  const [travelPace, setTravelPace] = useState<TravelPace>("moderate")
  const [avoidGravelRoads, setAvoidGravelRoads] = useState(false)

  useEffect(() => {
    const loadTrip = async () => {
      const user = getStoredUser()
      if (!user?.id || !tripId) {
        toast.error("Unable to load trip")
        router.push("/planner")
        return
      }

      try {
        const response = await fetch(`/api/trips/${tripId}?user_id=${user.id}`)
        const data = await response.json()

        if (!response.ok || !data.success || !data.trip) {
          toast.error(data.error || "Failed to load trip")
          router.push("/planner")
          return
        }

        const trip = data.trip as Trip
        setTitle(trip.title || "")
        setTripDurationDays(Math.max(1, Number(trip.trip_duration_days || 1)))
        setTravelPace((trip.travel_pace || "moderate") as TravelPace)
        setAvoidGravelRoads(Boolean(trip.avoid_gravel_roads))
      } catch (error) {
        console.error("Error loading trip:", error)
        toast.error("Failed to load trip")
        router.push("/planner")
      } finally {
        setLoading(false)
      }
    }

    void loadTrip()
  }, [router, tripId])

  const handleSave = async () => {
    const user = getStoredUser()
    if (!user?.id || !tripId) {
      toast.error("Unable to save trip")
      return
    }

    setSaving(true)
    try {
      const response = await fetch(`/api/trips/${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          title: title.trim(),
          trip_duration_days: Math.max(1, tripDurationDays),
          travel_pace: travelPace,
          avoid_gravel_roads: avoidGravelRoads,
        }),
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        toast.error(data.error || "Failed to save trip")
        return
      }

      toast.success("Trip updated")
      router.push(`/planner/${tripId}`)
    } catch (error) {
      console.error("Error saving trip:", error)
      toast.error("Failed to save trip")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container mx-auto max-w-2xl px-6 py-12">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading trip...
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto max-w-2xl px-6 py-12">
        <Card>
          <CardHeader>
            <CardTitle>Edit Trip</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Trip Duration (days)</Label>
              <Input
                id="duration"
                type="number"
                min={1}
                value={tripDurationDays}
                onChange={(e) => setTripDurationDays(Number(e.target.value || 1))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pace">Travel Pace</Label>
              <select
                id="pace"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={travelPace}
                onChange={(e) => setTravelPace(e.target.value as TravelPace)}
              >
                <option value="leisurely">Leisurely</option>
                <option value="moderate">Moderate</option>
                <option value="fast">Fast</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={avoidGravelRoads}
                onChange={(e) => setAvoidGravelRoads(e.target.checked)}
              />
              Avoid gravel roads
            </label>

            <div className="flex items-center gap-2 pt-2">
              <Button variant="outline" onClick={() => router.push(`/planner/${tripId}`)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving || !title.trim()}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
