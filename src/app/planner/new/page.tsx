"use client"

import { useEffect, useState } from "react"
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
import { toast } from "sonner"
import type { Stop } from "@/lib/types"

// Decode a Google Maps encoded polyline into lat/lng pairs
function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    let b: number
    let shift = 0
    let result = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dlat = result & 1 ? ~(result >> 1) : result >> 1
    lat += dlat

    shift = 0
    result = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dlng = result & 1 ? ~(result >> 1) : result >> 1
    lng += dlng

    points.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }

  return points
}

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
  const [step, setStep] = useState<"initial" | "details">("initial")
  const [loading, setLoading] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  
  const [title, setTitle] = useState("")
  const [startLocation, setStartLocation] = useState("")
  const [destination, setDestination] = useState("")
  const [startCoords, setStartCoords] = useState<LocationCoords>({ lat: 0, lng: 0 })
  const [destCoords, setDestCoords] = useState<LocationCoords>({ lat: 0, lng: 0 })
  const [stops, setStops] = useState<Stop[]>([])
  const [routeCoords, setRouteCoords] = useState<LocationCoords[]>([])
  
  const [petFriendly, setPetFriendly] = useState(false)
  const [avoidGravel, setAvoidGravel] = useState(false)
  const [tripDuration, setTripDuration] = useState("")
  const [travelPace, setTravelPace] = useState("")
  const [rigType, setRigType] = useState("")
  const [rigLengthM, setRigLengthM] = useState("")
  const [stayPreference, setStayPreference] = useState("")
  const [budgetPreference, setBudgetPreference] = useState("")
  const [seasonalPreference, setSeasonalPreference] = useState("")
  const [endDate, setEndDate] = useState("")
  const [notes, setNotes] = useState("")
  const [geocodeError, setGeocodeError] = useState<string | null>(null)

  useEffect(() => {
    async function loadDefaults() {
      try {
        const stored = localStorage.getItem("trackmate_user")
        const user = stored ? JSON.parse(stored) : null

        if (!user?.id) return

        let hasLoadedDefaults = false

        const response = await fetch(`/api/user/settings?user_id=${user.id}`)
        const data = await response.json()

        if (response.ok && data.success && data.settings) {
          const settings = data.settings

          if (settings.default_travel_pace) {
            setTravelPace(settings.default_travel_pace)
            hasLoadedDefaults = true
          }
          if (settings.default_rig_type) {
            setRigType(settings.default_rig_type)
            hasLoadedDefaults = true
          }
          if (settings.default_rig_length_m !== null && settings.default_rig_length_m !== undefined) {
            setRigLengthM(String(settings.default_rig_length_m))
            hasLoadedDefaults = true
          }
          if (settings.default_stay_preference) {
            setStayPreference(settings.default_stay_preference)
            hasLoadedDefaults = true
          }
          if (settings.default_budget_preference) {
            setBudgetPreference(settings.default_budget_preference)
            hasLoadedDefaults = true
          }
          if (settings.default_pet_friendly_required !== null && settings.default_pet_friendly_required !== undefined) {
            setPetFriendly(Boolean(settings.default_pet_friendly_required))
            hasLoadedDefaults = true
          }
          if (settings.default_avoid_gravel_roads !== null && settings.default_avoid_gravel_roads !== undefined) {
            setAvoidGravel(Boolean(settings.default_avoid_gravel_roads))
            hasLoadedDefaults = true
          }
        }

        if (!hasLoadedDefaults) {
          const tripsResponse = await fetch(`/api/trips?user_id=${user.id}`)
          const tripsData = await tripsResponse.json()
          const latestTrip = tripsData?.trips?.[0]

          if (latestTrip) {
            if (latestTrip.travel_pace) setTravelPace(latestTrip.travel_pace)
            if (latestTrip.rig_type) setRigType(latestTrip.rig_type)
            if (latestTrip.rig_length_m !== null && latestTrip.rig_length_m !== undefined) {
              setRigLengthM(String(latestTrip.rig_length_m))
            }
            if (latestTrip.stay_preference) setStayPreference(latestTrip.stay_preference)
            if (latestTrip.budget_preference) setBudgetPreference(latestTrip.budget_preference)
            if (latestTrip.pet_friendly_required !== null && latestTrip.pet_friendly_required !== undefined) {
              setPetFriendly(Boolean(latestTrip.pet_friendly_required))
            }
            if (latestTrip.avoid_gravel_roads !== null && latestTrip.avoid_gravel_roads !== undefined) {
              setAvoidGravel(Boolean(latestTrip.avoid_gravel_roads))
            }
          }
        }
      } catch (error) {
        console.error("Error loading user defaults:", error)
      }
    }

    loadDefaults()
  }, [])

  const mapCenter = startCoords.lat !== 0 && startCoords.lng !== 0 
    ? startCoords 
    : destCoords.lat !== 0 && destCoords.lng !== 0 
      ? destCoords 
      : { lat: -25.2744, lng: 133.7751 }

  const canProceedToDetails = title.trim() && startLocation.trim() && destination.trim()

  async function handleProceedToDetails() {
    if (!canProceedToDetails) return

    setGeocoding(true)
    setGeocodeError(null)
    try {
      const [startResult, destResult] = await Promise.all([
        fetchGeocode(startLocation),
        fetchGeocode(destination),
      ])

      if (!startResult && !destResult) {
        setGeocodeError(`Could not find coordinates for "${startLocation}" or "${destination}". Please check the spelling and try again.`)
        return
      }
      if (!startResult) {
        setGeocodeError(`Could not find "${startLocation}". Please check the spelling and try again.`)
        return
      }
      if (!destResult) {
        setGeocodeError(`Could not find "${destination}". Please check the spelling and try again.`)
        return
      }

      setStartCoords({ lat: startResult.lat, lng: startResult.lng })
      setDestCoords({ lat: destResult.lat, lng: destResult.lng })

      // Fetch route polyline for the map preview (Gap 10)
      try {
        const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${startResult.lat},${startResult.lng}&destination=${destResult.lat},${destResult.lng}&key=${process.env.NEXT_PUBLIC_GMAPS_API_KEY}`
        const dirResponse = await fetch(directionsUrl)
        const dirData = await dirResponse.json()
        if (dirData.routes?.[0]?.overview_polyline?.points) {
          const decoded = decodePolyline(dirData.routes[0].overview_polyline.points)
          setRouteCoords(decoded)
        }
      } catch {
        // Non-fatal — map preview just won't show the polyline
      }

      setStep("details")
    } catch (error) {
      console.error("Geocoding error:", error)
      setGeocodeError("An error occurred while looking up locations. Please try again.")
    } finally {
      setGeocoding(false)
    }
  }

  async function fetchGeocode(address: string): Promise<{ lat: number; lng: number } | null> {
    const pickBestResult = (results: Array<{ address_components?: Array<{ short_name?: string; types?: string[] }>; geometry?: { location?: { lat?: number; lng?: number } } }>) => {
      if (!Array.isArray(results) || results.length === 0) return null

      const auResult = results.find((result) =>
        (result.address_components || []).some((component) =>
          component.types?.includes("country") && component.short_name === "AU"
        )
      )

      return auResult || results[0]
    }

    try {
      const geocodeBase = "https://maps.googleapis.com/maps/api/geocode/json"
      const primaryUrl = `${geocodeBase}?address=${encodeURIComponent(address)}&components=country:AU&region=au&key=${process.env.NEXT_PUBLIC_GMAPS_API_KEY}`
      const fallbackUrl = `${geocodeBase}?address=${encodeURIComponent(address)}&key=${process.env.NEXT_PUBLIC_GMAPS_API_KEY}`

      const primaryResponse = await fetch(primaryUrl)
      const primaryData = await primaryResponse.json()

      const bestPrimary = pickBestResult(primaryData.results || [])
      if (bestPrimary?.geometry?.location) {
        const lat = Number(bestPrimary.geometry.location.lat)
        const lng = Number(bestPrimary.geometry.location.lng)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

        return {
          lat,
          lng,
        }
      }

      // Fallback for edge cases where AU-restricted geocoding returns no result.
      const fallbackResponse = await fetch(fallbackUrl)
      const fallbackData = await fallbackResponse.json()
      const bestFallback = pickBestResult(fallbackData.results || [])
      if (bestFallback?.geometry?.location) {
        const lat = Number(bestFallback.geometry.location.lat)
        const lng = Number(bestFallback.geometry.location.lng)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

        return {
          lat,
          lng,
        }
      }
    } catch (error) {
      console.error("Geocoding error:", error)
    }
    return null
  }

  async function handleSubmitTrip() {
    // Validate duration is provided and valid (Gap 11)
    const parsedDuration = parseInt(tripDuration)
    if (!tripDuration || isNaN(parsedDuration) || parsedDuration < 1) {
      toast.error("Trip duration is required and must be at least 1 day")
      return
    }

    if (!travelPace) {
      toast.error("Please select a travel pace")
      return
    }

    setLoading(true)

    const stored = localStorage.getItem("trackmate_user")
    const user = stored ? JSON.parse(stored) : null

    if (!user?.id) {
      router.replace("/login")
      return
    }

    const tripData = {
      userId: user.id,
      title: title || `${startLocation} to ${destination}`,
      startLocation,
      destination,
      startLat: startCoords.lat,
      startLng: startCoords.lng,
      destLat: destCoords.lat,
      destLng: destCoords.lng,
      tripDurationDays: parsedDuration,
      travelPace: travelPace || "moderate",
      rigType: rigType || undefined,
      rigLengthM: rigLengthM ? parseFloat(rigLengthM) : undefined,
      petFriendlyRequired: petFriendly,
      stayPreference: stayPreference && stayPreference !== "none" ? stayPreference : undefined,
      avoidGravelRoads: avoidGravel,
      budgetPreference: budgetPreference && budgetPreference !== "none" ? budgetPreference : undefined,
      seasonalPreference: seasonalPreference && seasonalPreference !== "none" ? seasonalPreference : undefined,
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
          router.push(`/planner/${data.tripId}`)
        }
      } else {
        const error = await response.json()
        console.error("Error creating trip:", error)
        toast.error(error.error || "Failed to create trip")
      }
    } catch (error) {
      console.error("Error generating route:", error)
      toast.error("An error occurred. Please try again.")
    } finally {
      setLoading(false)
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
                    {geocoding ? "Looking up locations..." : "Continue"}
                  </Button>

                  {geocodeError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {geocodeError}
                    </div>
                  )}
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
                      <Label htmlFor="tripDuration">
                        Trip Duration (days) <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="tripDuration"
                        value={tripDuration}
                        onChange={(e) => setTripDuration(e.target.value)}
                        placeholder="e.g. 14"
                        type="number"
                        min={1}
                        required
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
                    <div className="space-y-2">
                      <Label htmlFor="seasonalPreference">Seasonal Preference</Label>
                      <Select value={seasonalPreference} onValueChange={setSeasonalPreference}>
                        <SelectTrigger id="seasonalPreference">
                          <SelectValue placeholder="No preference" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No preference</SelectItem>
                          <SelectItem value="summer">Summer (Dec–Feb)</SelectItem>
                          <SelectItem value="autumn">Autumn (Mar–May)</SelectItem>
                          <SelectItem value="winter">Winter (Jun–Aug)</SelectItem>
                          <SelectItem value="spring">Spring (Sep–Nov)</SelectItem>
                          <SelectItem value="dry-season">Dry Season (Apr–Oct)</SelectItem>
                          <SelectItem value="wet-season">Wet Season (Nov–Mar)</SelectItem>
                        </SelectContent>
                      </Select>
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

            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Map Preview</CardTitle>
              <CardDescription>
                {step === "initial" && "Enter locations to see preview"}
                {step === "details" && "Review your route"}
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

      </div>
    </main>
  )
}
