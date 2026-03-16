"use client"

import { useState } from "react"
import { LoadScript, GoogleMap, Marker } from "@react-google-maps/api"
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

const mapContainerStyle = {
  width: "100%",
  height: "500px",
}

const defaultCenter = {
  lat: -25.2744,
  lng: 133.7751,
}

export default function NewPlannerPage() {
     const [petFriendly, setPetFriendly] = useState(false)
  const [avoidGravel, setAvoidGravel] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const formData = new FormData(e.currentTarget)
    const values = Object.fromEntries(formData.entries())

    console.log({
      ...values,
      petFriendly,
      avoidGravel,
    })
  }

    return (
        <main className="min-h-screen bg-background px-4 py-8">
            <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-2xl">Plan a New Trip</CardTitle>
                        <CardDescription>
                            Enter your trip details to find verified stops along your route.
                        </CardDescription>
                    </CardHeader>

                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid gap-5 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="startLocation">Start Location</Label>
                                    <Input
                                        id="startLocation"
                                        name="startLocation"
                                        placeholder="e.g. Brisbane QLD"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="destination">Destination</Label>
                                    <Input
                                        id="destination"
                                        name="destination"
                                        placeholder="e.g. Cairns QLD"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid gap-5 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="tripDuration">Trip Duration</Label>
                                    <Input
                                        id="tripDuration"
                                        name="tripDuration"
                                        placeholder="e.g. 14 days"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="travelPace">Travel Pace</Label>
                                    <Select name="travelPace">
                                        <SelectTrigger id="travelPace">
                                            <SelectValue placeholder="Select travel pace" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="relaxed">Relaxed</SelectItem>
                                            <SelectItem value="balanced">Balanced</SelectItem>
                                            <SelectItem value="fast">Fast</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid gap-5 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="rigType">Rig Type</Label>
                                    <Select name="rigType">
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
                                    <Label htmlFor="stayPreference">Stay Preference</Label>
                                    <Select name="stayPreference">
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
                            </div>

                            <div className="grid gap-5 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="budgetPreference">Budget Preference</Label>
                                    <Select name="budgetPreference">
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

                                <div className="space-y-2">
                                    <Label htmlFor="maxRigLength">Max Rig Length (optional)</Label>
                                    <Input
                                        id="maxRigLength"
                                        name="maxRigLength"
                                        placeholder="e.g. 22ft"
                                    />
                                </div>
                            </div>

                            <div className="rounded-lg border p-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <Label htmlFor="petFriendly" className="text-base">
                                            Pet Friendly
                                        </Label>
                                        <p className="text-sm text-muted-foreground">
                                            Prefer stops that allow pets.
                                        </p>
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
                                        <Label htmlFor="avoidGravel" className="text-base">
                                            Avoid Gravel Roads
                                        </Label>
                                        <p className="text-sm text-muted-foreground">
                                            Prefer sealed-road friendly route options where possible.
                                        </p>
                                    </div>
                                    <Switch
                                        id="avoidGravel"
                                        checked={avoidGravel}
                                        onCheckedChange={setAvoidGravel}
                                    />
                                </div>
                            </div>

                            <Button type="submit" size="lg" className="w-full">
                                Generate Route Plan
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <Card className="h-fit">
                    <CardHeader>
                        <CardTitle>Map Preview</CardTitle>
                        <CardDescription>
                            Route and verified stops will appear here after submission.
                        </CardDescription>
                    </CardHeader>

                    <CardContent>
                        <LoadScript googleMapsApiKey={process.env.NEXT_PUBLIC_GMAPS_API_KEY!}>
                            <GoogleMap
                                mapContainerStyle={mapContainerStyle}
                                center={defaultCenter}
                                zoom={4}
                            >
                                <Marker position={defaultCenter} />
                            </GoogleMap>
                        </LoadScript>
                    </CardContent>
                </Card>
            </div>
        </main>
    )
}