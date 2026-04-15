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
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export default function EditTripPage() {
  const params = useParams<{ tripId: string }>()
  const router = useRouter()
  const tripId = params.tripId

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Basic fields
  const [title, setTitle] = useState("")
  const [startLocation, setStartLocation] = useState("")
  const [destination, setDestination] = useState("")
  const [tripDurationDays, setTripDurationDays] = useState(7)
  const [endDate, setEndDate] = useState("")

  // Travel preferences
  const [travelPace, setTravelPace] = useState<TravelPace>("moderate")
  const [avoidGravelRoads, setAvoidGravelRoads] = useState(false)
  const [petFriendlyRequired, setPetFriendlyRequired] = useState(false)
  const [stayPreference, setStayPreference] = useState("")
  const [budgetPreference, setBudgetPreference] = useState("")

  // Rig details
  const [rigType, setRigType] = useState("")
  const [rigLengthM, setRigLengthM] = useState("")

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
        setStartLocation(trip.start_location_text || "")
        setDestination(trip.destination_text || "")
        setTripDurationDays(Math.max(1, Number(trip.trip_duration_days || 1)))
        setEndDate(trip.end_date || "")
        setTravelPace((trip.travel_pace || "moderate") as TravelPace)
        setAvoidGravelRoads(Boolean(trip.avoid_gravel_roads))
        setPetFriendlyRequired(Boolean(trip.pet_friendly_required))
        setStayPreference(trip.stay_preference || "")
        setBudgetPreference(trip.budget_preference || "")
        setRigType(trip.rig_type || "")
        setRigLengthM(trip.rig_length_m != null ? String(trip.rig_length_m) : "")
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

    if (!title.trim()) {
      toast.error("Title is required")
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
          start_location_text: startLocation.trim(),
          destination_text: destination.trim(),
          trip_duration_days: Math.max(1, tripDurationDays),
          end_date: endDate || null,
          travel_pace: travelPace,
          avoid_gravel_roads: avoidGravelRoads,
          pet_friendly_required: petFriendlyRequired,
          stay_preference: stayPreference || null,
          budget_preference: budgetPreference || null,
          rig_type: rigType || null,
          rig_length_m: rigLengthM ? parseFloat(rigLengthM) : null,
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
          <CardContent className="space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Trip Details</h3>

              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start">Start Location</Label>
                  <Input
                    id="start"
                    value={startLocation}
                    onChange={(e) => setStartLocation(e.target.value)}
                    placeholder="e.g. Melbourne, VIC"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="destination">Destination</Label>
                  <Input
                    id="destination"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="e.g. Cairns, QLD"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="duration">Trip Duration (days)</Label>
                  <Input
                    id="duration"
                    type="number"
                    min={1}
                    value={tripDurationDays}
                    onChange={(e) => setTripDurationDays(Math.max(1, Number(e.target.value || 1)))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Rig Details */}
            <div className="space-y-4 border-t pt-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Rig Details</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rigType">Rig Type</Label>
                  <Select value={rigType} onValueChange={setRigType}>
                    <SelectTrigger id="rigType">
                      <SelectValue placeholder="Select rig type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="caravan">Caravan</SelectItem>
                      <SelectItem value="motorhome">Motorhome</SelectItem>
                      <SelectItem value="camper-trailer">Camper Trailer</SelectItem>
                      <SelectItem value="4wd-camper">4WD Camper</SelectItem>
                      <SelectItem value="tent">Tent / No rig</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rigLength">Rig Length (metres)</Label>
                  <Input
                    id="rigLength"
                    type="number"
                    min={0}
                    step={0.5}
                    value={rigLengthM}
                    onChange={(e) => setRigLengthM(e.target.value)}
                    placeholder="e.g. 7.5"
                  />
                </div>
              </div>
            </div>

            {/* Travel Preferences */}
            <div className="space-y-4 border-t pt-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Travel Preferences</h3>

              <div className="space-y-2">
                <Label htmlFor="pace">Travel Pace</Label>
                <Select value={travelPace} onValueChange={(v) => setTravelPace(v as TravelPace)}>
                  <SelectTrigger id="pace">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="leisurely">Leisurely (~200 km/day)</SelectItem>
                    <SelectItem value="moderate">Moderate (~300 km/day)</SelectItem>
                    <SelectItem value="fast">Fast (~400 km/day)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stay">Stay Preference</Label>
                  <Select value={stayPreference} onValueChange={setStayPreference}>
                    <SelectTrigger id="stay">
                      <SelectValue placeholder="No preference" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No preference</SelectItem>
                      <SelectItem value="free-camps">Free camps</SelectItem>
                      <SelectItem value="caravan-parks">Caravan parks</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="budget">Budget Preference</Label>
                  <Select value={budgetPreference} onValueChange={setBudgetPreference}>
                    <SelectTrigger id="budget">
                      <SelectValue placeholder="No preference" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No preference</SelectItem>
                      <SelectItem value="free">Free only</SelectItem>
                      <SelectItem value="budget">Budget (no premium)</SelectItem>
                      <SelectItem value="any">Any</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Avoid gravel roads</p>
                  <p className="text-xs text-muted-foreground">Only show stops accessible on sealed roads</p>
                </div>
                <Switch checked={avoidGravelRoads} onCheckedChange={setAvoidGravelRoads} />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Pet-friendly stops required</p>
                  <p className="text-xs text-muted-foreground">Filter to pet-friendly campsites only</p>
                </div>
                <Switch checked={petFriendlyRequired} onCheckedChange={setPetFriendlyRequired} />
              </div>
            </div>

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
