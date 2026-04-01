"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Save, Settings2, User } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

interface SettingsForm {
  email: string
  firstName: string
  lastName: string
  phone: string
  timezone: string
  defaultTravelPace: string
  defaultRigType: string
  defaultRigLengthM: string
  defaultPetFriendlyRequired: boolean
  defaultAvoidGravelRoads: boolean
  defaultStayPreference: string
  defaultBudgetPreference: string
}

const defaultForm: SettingsForm = {
  email: "",
  firstName: "",
  lastName: "",
  phone: "",
  timezone: "",
  defaultTravelPace: "",
  defaultRigType: "",
  defaultRigLengthM: "",
  defaultPetFriendlyRequired: false,
  defaultAvoidGravelRoads: false,
  defaultStayPreference: "",
  defaultBudgetPreference: "",
}

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [form, setForm] = useState<SettingsForm>(defaultForm)

  useEffect(() => {
    async function loadSettings() {
      try {
        const stored = localStorage.getItem("trackmate_user")
        const user = stored ? JSON.parse(stored) : null

        if (!user?.id) {
          router.replace("/login")
          return
        }

        setUserId(user.id)

        const response = await fetch(`/api/user/settings?user_id=${user.id}`)
        const data = await response.json()

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to load settings")
        }

        const settings = data.settings || {}
        setForm({
          email: settings.email || user.email || "",
          firstName: settings.first_name || "",
          lastName: settings.last_name || "",
          phone: settings.phone || "",
          timezone: settings.timezone || "",
          defaultTravelPace: settings.default_travel_pace || "",
          defaultRigType: settings.default_rig_type || "",
          defaultRigLengthM:
            settings.default_rig_length_m === null || settings.default_rig_length_m === undefined
              ? ""
              : String(settings.default_rig_length_m),
          defaultPetFriendlyRequired: Boolean(settings.default_pet_friendly_required),
          defaultAvoidGravelRoads: Boolean(settings.default_avoid_gravel_roads),
          defaultStayPreference: settings.default_stay_preference || "",
          defaultBudgetPreference: settings.default_budget_preference || "",
        })
      } catch (error) {
        console.error("Error loading settings:", error)
        toast.error("Could not load settings")
      } finally {
        setLoading(false)
      }
    }

    loadSettings()
  }, [router])

  const canSave = useMemo(() => !loading && !saving && !!userId, [loading, saving, userId])

  const setField = <K extends keyof SettingsForm>(field: K, value: SettingsForm[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    if (!userId) return

    setSaving(true)
    try {
      const response = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          email: form.email,
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          timezone: form.timezone,
          defaultTravelPace: form.defaultTravelPace,
          defaultRigType: form.defaultRigType,
          defaultRigLengthM: form.defaultRigLengthM ? Number(form.defaultRigLengthM) : null,
          defaultPetFriendlyRequired: form.defaultPetFriendlyRequired,
          defaultAvoidGravelRoads: form.defaultAvoidGravelRoads,
          defaultStayPreference: form.defaultStayPreference,
          defaultBudgetPreference: form.defaultBudgetPreference,
        }),
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save settings")
      }

      toast.success("Settings saved")
    } catch (error) {
      console.error("Error saving settings:", error)
      toast.error(error instanceof Error ? error.message : "Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-background px-4 py-10">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm text-muted-foreground">Loading settings...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Manage profile basics and default trip preferences in one place.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push("/planner")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Trips
            </Button>
            <Button onClick={handleSave} disabled={!canSave}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Profile Basics
            </CardTitle>
            <CardDescription>
              These details help personalize your planning experience.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Email</Label>
              <Input value={form.email} disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                value={form.firstName}
                onChange={(e) => setField("firstName", e.target.value)}
                placeholder="Enter first name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={form.lastName}
                onChange={(e) => setField("lastName", e.target.value)}
                placeholder="Enter last name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                placeholder="e.g. 0400 000 000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                value={form.timezone}
                onChange={(e) => setField("timezone", e.target.value)}
                placeholder="e.g. Australia/Sydney"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Trip Defaults
            </CardTitle>
            <CardDescription>
              These values automatically prefill the new trip form.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="defaultTravelPace">Travel Pace</Label>
                <Select
                  value={form.defaultTravelPace || "unset"}
                  onValueChange={(value) => setField("defaultTravelPace", value === "unset" ? "" : value)}
                >
                  <SelectTrigger id="defaultTravelPace">
                    <SelectValue placeholder="Select default pace" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">No default</SelectItem>
                    <SelectItem value="leisurely">Leisurely</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="fast">Fast</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="defaultRigType">Rig Type</Label>
                <Select
                  value={form.defaultRigType || "unset"}
                  onValueChange={(value) => setField("defaultRigType", value === "unset" ? "" : value)}
                >
                  <SelectTrigger id="defaultRigType">
                    <SelectValue placeholder="Select default rig type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">No default</SelectItem>
                    <SelectItem value="car">Car</SelectItem>
                    <SelectItem value="campervan">Campervan</SelectItem>
                    <SelectItem value="caravan">Caravan</SelectItem>
                    <SelectItem value="motorhome">Motorhome</SelectItem>
                    <SelectItem value="4wd-camper">4WD + Camper</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="defaultRigLengthM">Rig Length (meters)</Label>
                <Input
                  id="defaultRigLengthM"
                  value={form.defaultRigLengthM}
                  onChange={(e) => setField("defaultRigLengthM", e.target.value)}
                  placeholder="e.g. 6.5"
                  type="number"
                  step="0.01"
                  min="0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="defaultStayPreference">Stay Preference</Label>
                <Select
                  value={form.defaultStayPreference || "unset"}
                  onValueChange={(value) => setField("defaultStayPreference", value === "unset" ? "" : value)}
                >
                  <SelectTrigger id="defaultStayPreference">
                    <SelectValue placeholder="Select default stay preference" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">No default</SelectItem>
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
                <Label htmlFor="defaultBudgetPreference">Budget Preference</Label>
                <Select
                  value={form.defaultBudgetPreference || "unset"}
                  onValueChange={(value) => setField("defaultBudgetPreference", value === "unset" ? "" : value)}
                >
                  <SelectTrigger id="defaultBudgetPreference">
                    <SelectValue placeholder="Select default budget" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">No default</SelectItem>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="budget">Budget</SelectItem>
                    <SelectItem value="mid-range">Mid-range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="defaultPetFriendlyRequired" className="text-base">
                    Default to Pet Friendly
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Prefill new trips to prefer stops that allow pets.
                  </p>
                </div>
                <Switch
                  id="defaultPetFriendlyRequired"
                  checked={form.defaultPetFriendlyRequired}
                  onCheckedChange={(checked) => setField("defaultPetFriendlyRequired", checked)}
                />
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="defaultAvoidGravelRoads" className="text-base">
                    Default to Avoid Gravel Roads
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Prefill new trips to prioritize sealed-road routes.
                  </p>
                </div>
                <Switch
                  id="defaultAvoidGravelRoads"
                  checked={form.defaultAvoidGravelRoads}
                  onCheckedChange={(checked) => setField("defaultAvoidGravelRoads", checked)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
