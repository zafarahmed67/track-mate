"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LoadScript, GoogleMap, Marker, Polyline } from "@react-google-maps/api"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { TripStops } from "@/components/planner/trip-stops"
import type { Stop } from "@/lib/types"

const mapContainerStyle = {
  width: "100%",
  height: "400px",
}

interface LocationCoords {
  lat: number
  lng: number
}

export default function NewPlannerPage() {
  const router = useRouter()
  const [step, setStep] = useState<"initial" | "details" | "complete">("initial")
  const [loading, setLoading] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  
  const [title, setTitle] = useState("")
  const [startLocation, setStartLocation] = useState("")
  const [destination, setDestination] = useState("")
  const [startCoords, setStartCoords] = useState<LocationCoords>({ lat: 0, lng: 0 })
  const [destCoords, setDestCoords] = useState<LocationCoords>({ lat: 0, lng: 0 })
  const [stops, setStops] = useState<Stop[]>([])
  const [tripId, setTripId] = useState<string | null>(null)
  const [routeCoords, setRouteCoords] = useState<LocationCoords[]>([])
  
  const [petFriendly, setPetFriendly] = useState(false)
  const [avoidGravel, setAvoidGravel] = useState(false)
  const [tripDuration, setTripDuration] = useState("")
  const [travelPace, setTravelPace] = useState("")
  const [rigType, setRigType] = useState("")
  const [rigLengthM, setRigLengthM] = useState("")
  const [stayPreference, setStayPreference] = useState("")
  const [budgetPreference, setBudgetPreference] = useState("")
  const [endDate, setEndDate] = useState("")
  const [notes, setNotes] = useState("")

  const mapCenter = startCoords.lat !== 0 && startCoords.lng !== 0 
    ? startCoords 
    : destCoords.lat !== 0 && destCoords.lng !== 0 
      ? destCoords 
      : { lat: -25.2744, lng: 133.7751 }

  const canProceedToDetails = title.trim() && startLocation.trim() && destination.trim()

  async function handleProceedToDetails() {
    if (!canProceedToDetails) return
    
    setGeocoding(true)
    try {
      const [startResult, destResult] = await Promise.all([
        fetchGeocode(startLocation),
        fetchGeocode(destination),
      ])

      if (startResult) {
        setStartCoords({ lat: startResult.lat, lng: startResult.lng })
      }
      if (destResult) {
        setDestCoords({ lat: destResult.lat, lng: destResult.lng })
      }

      if (startResult || destResult) {
        setStep("details")
      }
    } catch (error) {
      console.error("Geocoding error:", error)
    } finally {
      setGeocoding(false)
    }
  }

  async function fetchGeocode(address: string) {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.NEXT_PUBLIC_GMAPS_API_KEY}`
      )
      const data = await response.json()
      if (data.results && data.results[0]) {
        return {
          lat: data.results[0].geometry.location.lat,
          lng: data.results[0].geometry.location.lng,
        }
      }
    } catch (error) {
      console.error("Geocoding error:", error)
    }
    return null
  }

  async function handleSubmitTrip() {
    setLoading(true)
    
    const tripData = {
      title: title || `${startLocation} to ${destination}`,
      startLocation,
      destination,
      startLat: startCoords.lat,
      startLng: startCoords.lng,
      destLat: destCoords.lat,
      destLng: destCoords.lng,
      tripDurationDays: parseInt(tripDuration) || 14,
      travelPace: travelPace || "moderate",
      rigType: rigType || undefined,
      rigLengthM: rigLengthM ? parseFloat(rigLengthM) : undefined,
      petFriendlyRequired: petFriendly,
      stayPreference: stayPreference || undefined,
      avoidGravelRoads: avoidGravel,
      budgetPreference: budgetPreference || undefined,
      notes: notes || undefined,
      endDate: endDate || undefined,
      status: "planned",
    }

    try {
      const response = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tripData),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.tripId) {
          setTripId(data.tripId)
          
          const datas = await fetchNearbyStops(data.tripId, startCoords, destCoords)
          console.log("Nearby stops fetched:", datas)
          setStep("complete")
        }
      } else {
        const error = await response.json()
        console.error("Error creating trip:", error)
      }
    } catch (error) {
      console.error("Error generating route:", error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchNearbyStops(tripId: string, start: LocationCoords, dest: LocationCoords) {
    try {
      const response = await fetch("/api/stops/nearby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          startLat: start.lat,
          startLng: start.lng,
          destLat: dest.lat,
          destLng: dest.lng,
          startLocationText: startLocation,
          destLocationText: destination,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        console.log("=== NEARBY STOPS API RESPONSE ===")
        console.log("success:", data.success)
        console.log("stops:", data.stops)
        console.log("stops count:", data.stops?.length || 0)
        console.log("route:", data.route)
        console.log("route count:", data.route?.length || 0)
        
        if (data.stops && data.stops.length > 0) {
          console.log("First stop sample:", {
            id: data.stops[0].id,
            location_name: data.stops[0].location_name,
            latitude: data.stops[0].latitude,
            longitude: data.stops[0].longitude
          })
          setStops(data.stops)
        }
        
        if (data.route && data.route.length > 0) {
          const coords = data.route.map((c: [number, number]) => ({
            lat: c[0],
            lng: c[1]
          }))
          console.log("First 3 route points:", coords.slice(0, 3))
          console.log("Setting route coords, count:", coords.length)
          setRouteCoords(coords)
        } else {
          console.log("No route in response!")
        }
      } else {
        const error = await response.json()
        console.error("API error:", error)
      }
    } catch (error) {
      console.error("Error fetching nearby stops:", error)
    }
  }

  function handleViewTrip() {
    if (tripId) {
      router.push(`/planner/${tripId}`)
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Plan a New Trip</CardTitle>
              <CardDescription>
                {step === "initial" && "Enter your trip details to find verified stops along your route."}
                {step === "details" && "Customize your trip preferences."}
                {step === "complete" && "Your trip has been created!"}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {step === "initial" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="title">Trip Title</Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Queensland Coast Adventure"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="startLocation">Start Location</Label>
                    <Input
                      id="startLocation"
                      value={startLocation}
                      onChange={(e) => setStartLocation(e.target.value)}
                      placeholder="e.g. Brisbane QLD"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="destination">Destination</Label>
                    <Input
                      id="destination"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder="e.g. Cairns QLD"
                    />
                  </div>

                  <Button 
                    onClick={handleProceedToDetails} 
                    disabled={!canProceedToDetails || geocoding}
                    className="w-full"
                  >
                    {geocoding ? "Getting coordinates..." : "Continue"}
                  </Button>
                </>
              )}

              {step === "details" && (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Start Location</Label>
                      <Input value={startLocation} disabled />
                      <div className="flex gap-2">
                        <Input 
                          placeholder="Lat" 
                          value={startCoords.lat === 0 ? "" : startCoords.lat.toFixed(4)}
                          onChange={(e) => setStartCoords(s => ({ ...s, lat: parseFloat(e.target.value) || 0 }))}
                          type="number"
                          step="any"
                        />
                        <Input 
                          placeholder="Lng" 
                          value={startCoords.lng === 0 ? "" : startCoords.lng.toFixed(4)}
                          onChange={(e) => setStartCoords(s => ({ ...s, lng: parseFloat(e.target.value) || 0 }))}
                          type="number"
                          step="any"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Destination</Label>
                      <Input value={destination} disabled />
                      <div className="flex gap-2">
                        <Input 
                          placeholder="Lat" 
                          value={destCoords.lat === 0 ? "" : destCoords.lat.toFixed(4)}
                          onChange={(e) => setDestCoords(s => ({ ...s, lat: parseFloat(e.target.value) || 0 }))}
                          type="number"
                          step="any"
                        />
                        <Input 
                          placeholder="Lng" 
                          value={destCoords.lng === 0 ? "" : destCoords.lng.toFixed(4)}
                          onChange={(e) => setDestCoords(s => ({ ...s, lng: parseFloat(e.target.value) || 0 }))}
                          type="number"
                          step="any"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="tripDuration">Trip Duration (days)</Label>
                      <Input
                        id="tripDuration"
                        value={tripDuration}
                        onChange={(e) => setTripDuration(e.target.value)}
                        placeholder="e.g. 14"
                        type="number"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="travelPace">Travel Pace</Label>
                      <Select value={travelPace} onValueChange={setTravelPace}>
                        <SelectTrigger id="travelPace">
                          <SelectValue placeholder="Select travel pace" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="leisurely">Leisurely</SelectItem>
                          <SelectItem value="moderate">Moderate</SelectItem>
                          <SelectItem value="fast">Fast</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="rigType">Rig Type</Label>
                      <Select value={rigType} onValueChange={setRigType}>
                        <SelectTrigger id="rigType">
                          <SelectValue placeholder="Select rig type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="car">Car</SelectItem>
                          <SelectItem value="campervan">Campervan</SelectItem>
                          <SelectItem value="caravan">Caravan</SelectItem>
                          <SelectItem value="motorhome">Motorhome</SelectItem>
                          <SelectItem value="4wd-camper">4WD + Camper</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="rigLengthM">Rig Length (meters)</Label>
                      <Input
                        id="rigLengthM"
                        value={rigLengthM}
                        onChange={(e) => setRigLengthM(e.target.value)}
                        placeholder="e.g. 6.5"
                        type="number"
                        step="0.01"
                      />
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="stayPreference">Stay Preference</Label>
                      <Select value={stayPreference} onValueChange={setStayPreference}>
                        <SelectTrigger id="stayPreference">
                          <SelectValue placeholder="Select stay preference" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any</SelectItem>
                          <SelectItem value="free-camps">Free Camps</SelectItem>
                          <SelectItem value="caravan-parks">Caravan Parks</SelectItem>
                          <SelectItem value="mix">Mix</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="budgetPreference">Budget Preference</Label>
                      <Select value={budgetPreference} onValueChange={setBudgetPreference}>
                        <SelectTrigger id="budgetPreference">
                          <SelectValue placeholder="Select budget" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any</SelectItem>
                          <SelectItem value="free">Free</SelectItem>
                          <SelectItem value="budget">Budget</SelectItem>
                          <SelectItem value="mid-range">Mid-range</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="endDate">End Date</Label>
                      <Input
                        id="endDate"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        type="date"
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <Label htmlFor="petFriendly" className="text-base">Pet Friendly</Label>
                        <p className="text-sm text-muted-foreground">Prefer stops that allow pets.</p>
                      </div>
                      <Switch
                        id="petFriendly"
                        checked={petFriendly}
                        onCheckedChange={setPetFriendly}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <Label htmlFor="avoidGravel" className="text-base">Avoid Gravel Roads</Label>
                        <p className="text-sm text-muted-foreground">Prefer sealed-road friendly routes.</p>
                      </div>
                      <Switch
                        id="avoidGravel"
                        checked={avoidGravel}
                        onCheckedChange={setAvoidGravel}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Any additional notes..."
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-4">
                    <Button variant="outline" onClick={() => setStep("initial")} className="flex-1">
                      Back
                    </Button>
                    <Button onClick={handleSubmitTrip} disabled={loading} className="flex-1">
                      {loading ? "Creating..." : "Create Trip"}
                    </Button>
                  </div>
                </>
              )}

              {step === "complete" && (
                <div className="text-center py-8">
                  <h3 className="text-xl font-semibold mb-2">Trip Created Successfully!</h3>
                  <p className="text-muted-foreground mb-4">
                    Found {stops.length} stops along your route.
                  </p>
                  <Button onClick={handleViewTrip}>
                    View Trip Details
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Map Preview</CardTitle>
              <CardDescription>
                {step === "initial" && "Enter locations to see preview"}
                {step === "details" && "Review your route"}
                {step === "complete" && "Your planned route"}
              </CardDescription>
            </CardHeader>

            <CardContent>
              <div key={step + routeCoords.length + stops.length}>
                <LoadScript googleMapsApiKey={process.env.NEXT_PUBLIC_GMAPS_API_KEY!} libraries={["places"]}>
                  <GoogleMap
                    mapContainerStyle={mapContainerStyle}
                    center={mapCenter}
                    zoom={step === "initial" ? 4 : step === "details" ? 6 : 8}
                  >
                    {routeCoords.length > 0 && (
                      <Polyline
                        path={routeCoords.map(c => ({ lat: c.lat, lng: c.lng }))}
                        options={{
                          strokeColor: "#2563eb",
                          strokeOpacity: 0.8,
                          strokeWeight: 4,
                        }}
                      />
                    )}
                    <Marker position={startCoords} label="A" />
                    <Marker position={destCoords} label="B" />
                    {stops.map((stop, index) => {
                      const lat = parseFloat(stop.latitude)
                      const lng = parseFloat(stop.longitude)
                      if (isNaN(lat) || isNaN(lng)) return null
                      return (
                        <Marker
                          key={stop.id}
                          position={{ lat, lng }}
                          label={{ text: String(index + 1), color: "white" }}
                          title={stop.location_name}
                        />
                      )
                    })}
                  </GoogleMap>
                </LoadScript>
              </div>
            </CardContent>
          </Card>
        </div>

        {step === "complete" && stops.length > 0 && (
          <div className="mt-6">
            <TripStops stops={stops} />
          </div>
        )}
      </div>
    </main>
  )
}
