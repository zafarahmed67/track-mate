import { supabaseAdmin } from "@/config/supabase"
import { generateNarrativeForTrip } from "@/utils/generateItineraryNarrative"
import { NextRequest, NextResponse, after } from "next/server"

export const maxDuration = 300
import { calculateDistance } from "@/utils/calculateDistance"
import { generateDBStop } from "@/utils/generateDBStop"
import { generateCustomStop } from "@/utils/generateCustomStop"
import { organizeStopsByDay } from "@/utils/organizeStopsByDay"

interface UserMetadata {
  defaults?: {
    travelPace?: string | null
    rigType?: string | null
    rigLengthM?: number | null
    petFriendlyRequired?: boolean
    avoidGravelRoads?: boolean
    stayPreference?: string | null
    budgetPreference?: string | null
  }
  [key: string]: unknown
}

interface CreateTripParams {
  userId: string
  title: string
  startLocation: string
  destination: string
  startLat?: number | null
  startLng?: number | null
  destLat?: number | null
  destLng?: number | null
  tripDurationDays: number
  travelPace?: string | null
  rigType?: string | null
  rigLengthM?: number | null
  petFriendlyRequired?: boolean
  stayPreference?: string | null
  avoidGravelRoads?: boolean
  budgetPreference?: string | null
  notes?: string | null
  endDate?: string | null
  status?: string
  plannerInput: unknown
}



async function createTrip(params: CreateTripParams) {
  if (!supabaseAdmin) {
    return {
      data: null,
      error: { message: "Database not configured" },
    }
  }

  const {
    userId,
    title,
    startLocation,
    destination,
    startLat,
    startLng,
    destLat,
    destLng,
    tripDurationDays,
    travelPace,
    rigType,
    rigLengthM,
    petFriendlyRequired,
    stayPreference,
    avoidGravelRoads,
    budgetPreference,
    notes,
    endDate,
    status = "planned",
    plannerInput,
  } = params

  return supabaseAdmin
    .from("trips")
    .insert({
      user_id: userId,
      title,
      start_location_text: startLocation,
      destination_text: destination,
      start_lat: startLat ?? null,
      start_lng: startLng ?? null,
      destination_lat: destLat ?? null,
      destination_lng: destLng ?? null,
      trip_duration_days: tripDurationDays,
      travel_pace: travelPace ?? "moderate",
      rig_type: rigType ?? null,
      rig_length_m: rigLengthM ?? null,
      pet_friendly_required: petFriendlyRequired ?? false,
      stay_preference: stayPreference ?? null,
      avoid_gravel_roads: avoidGravelRoads ?? false,
      budget_preference: budgetPreference ?? null,
      notes: notes ?? null,
      end_date: endDate ?? null,
      status,
      planner_input_json: plannerInput,
      route_data_json: {},
    })
    .select()
    .single()
}

function isWithinAustralia(lat: number, lng: number): boolean {
  // Broad mainland + Tasmania bounding box.
  return lat >= -44.5 && lat <= -9 && lng >= 112 && lng <= 154
}

function extractCountryCode(components: Array<{ short_name?: string; types?: string[] }>): string | null {
  const country = components.find((component) => component.types?.includes("country"))
  return country?.short_name ?? null
}

async function geocodeWithAustraliaBias(address: string): Promise<{ lat: number; lng: number; formattedAddress?: string } | null> {
  const apiKey = process.env.NEXT_PUBLIC_GMAPS_API_KEY
  if (!apiKey) return null

  const base = "https://maps.googleapis.com/maps/api/geocode/json"
  const url = `${base}?address=${encodeURIComponent(address)}&components=country:AU&region=au&key=${apiKey}`

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)
    if (!response.ok) {
      console.warn("[geocode] HTTP error, trying fallback")
      return geocodeWithNominatim(address)
    }
    const data = await response.json()
    const results = Array.isArray(data?.results) ? data.results : []
    if (results.length === 0) return geocodeWithNominatim(address)

    const australianResult = results.find((result: { address_components?: Array<{ short_name?: string; types?: string[] }>; geometry?: { location?: { lat?: number; lng?: number } }; formatted_address?: string }) => {
      const country = extractCountryCode(result.address_components || [])
      return country === "AU"
    }) || results[0]

    const lat = Number(australianResult?.geometry?.location?.lat)
    const lng = Number(australianResult?.geometry?.location?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return geocodeWithNominatim(address)

    return {
      lat,
      lng,
      formattedAddress: australianResult.formatted_address,
    }
  } catch (err) {
    console.warn("[geocode] Failed, trying fallback:", err)
    return geocodeWithNominatim(address)
  }
}

async function geocodeWithNominatim(address: string): Promise<{ lat: number; lng: number; formattedAddress?: string } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ", Australia")}&limit=1`

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "TrackMate/1.0" },
    })
    clearTimeout(timeoutId)
    if (!response.ok) return null

    const data = await response.json()
    if (!Array.isArray(data) || data.length === 0) return null

    const result = data[0]
    const lat = Number(result.lat)
    const lng = Number(result.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

    return {
      lat,
      lng,
      formattedAddress: result.display_name,
    }
  } catch {
    return null
  }
}

type TravelPace = "leisurely" | "moderate" | "fast"

const TRAVEL_PACE_KM = {
  leisurely: 175,
  moderate: 250,
  fast: 350,
} as const

interface TripGenerationJob {
  tripId: string
  userId: string
  title: string
  startLat: number
  startLng: number
  destLat: number
  destLng: number
  tripDurationDays: number
  travelPace: TravelPace
  stayPreference: string | null
  budgetPreference: string | null
  avoidGravelRoads: boolean
  petFriendlyRequired: boolean
  rigType: string | null
  rigLengthM: number | null
  endDate: string | null
}

async function processTripGenerationJob(job: TripGenerationJob): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error("Database not configured")
  }

  let generatedStopsCount = 0
  let customStopsCount = 0

  await supabaseAdmin
    .from("trips")
    .update({ status: "in_progress" })
    .eq("id", job.tripId)

  const tripId = job.tripId;
  const tripName = job.title;
  const tripDuration = job.tripDurationDays;
  const tripTravelPace = job.travelPace;
  const startCoords = {
    lat: job.startLat,
    lng: job.startLng
  }
  const destCoords = {
    lat: job.destLat,
    lng: job.destLng
  }

  console.log("Starting trip generation job", {
    tripId, tripName, tripDuration, tripTravelPace, startCoords, destCoords
  })

  const totalTripDistanceKM = calculateDistance(
    job.startLat,
    job.startLng,
    job.destLat,
    job.destLng
  );

  console.log("totalTripDistanceKM:", totalTripDistanceKM);

  const estimatedDriveDistanceKm = Math.max(
    totalTripDistanceKM,
    Math.min(totalTripDistanceKM * 1.45, totalTripDistanceKM + 600)
  );
  console.log("estimatedDriveDistanceKm:", estimatedDriveDistanceKm);

  const kmPerDay = TRAVEL_PACE_KM[tripTravelPace] ?? 175
  console.log("kmPerDay based on travel pace:", kmPerDay);

  const suggestedDays = Math.max(1, Math.round(estimatedDriveDistanceKm / kmPerDay))
  console.log("suggestedDays based on estimated distance and pace:", suggestedDays);

  await supabaseAdmin
    .from("trips")
    .update({
      suggested_days: suggestedDays,
      total_distance_km: Math.round(estimatedDriveDistanceKm),
    })
    .eq("id", job.tripId)

  const { success: generateSuccess, stops: dbStops, error: generateError } = await generateDBStop(
    job.startLat,
    job.startLng,
    job.destLat,
    job.destLng,
    tripTravelPace,
    totalTripDistanceKM
  )

  if (generateError) {
    console.warn("[2/4] Stop generation warning:", generateError)
  }

  if (generateSuccess && dbStops.length > 0) {
    const stopInserts = dbStops.map((stop) => ({
      trip_id: job.tripId,
      stop_id: stop.id,
      source_type: stop.verification_status,
    }))

    console.log("stopInserts:", stopInserts);

    const { data, error } = await supabaseAdmin
      .from("trip_candidate_stops")
      .upsert(stopInserts, {
        onConflict: "trip_id,stop_id,generation_version",
      })
      .select(); // 👈 REQUIRED

    if (error) {
      console.error("Upsert error:", error);
    }
    generatedStopsCount = data?.length ?? 0;
    console.log("[2/4] Saved verified stops", data)
  }

  const {
    success: customSuccess,
    stopsGenerated = 0,
    routeDistanceKm: customRouteDistanceKm,
    encodedPolyline,
    error: customError,
  } = await generateCustomStop(
    job.startLat,
    job.startLng,
    job.destLat,
    job.destLng,
    job.tripId,
    suggestedDays,
  )

  if (customError) {
    console.warn("[3/4] Custom stop generation warning:", customError)
  }

  if (customSuccess) {
    customStopsCount = stopsGenerated
  }

  console.log("stopsGenerated:", stopsGenerated);
  console.log("generatedStopsCount:", generatedStopsCount);

  console.log("[4/4] Organizing stops by day...", {
    suggestedDays,
    userDays: job.tripDurationDays,
    verifiedStops: generatedStopsCount,
    customStops: stopsGenerated,
  })

  // Days are always derived from pace + distance. The user's requested days are
  // advisory only — if they ask for more or fewer days than pace allows, we snap
  // to the pace-based value so driving distances per day stay realistic.
  const finalTripDays = Math.max(1, suggestedDays)
  console.log("finalTripDays:", finalTripDays);

  const daysAdjusted = job.tripDurationDays !== finalTripDays
  console.log("daysAdjusted:", daysAdjusted);

  let daysAdjustment: { originalDays: number; adjustedToDays: number; reason: string } | null = null

  if (daysAdjusted) {
    const requestedKmPerDay = Math.round(estimatedDriveDistanceKm / job.tripDurationDays)
    const adjustedKmPerDay = Math.round(estimatedDriveDistanceKm / finalTripDays)
    daysAdjustment = {
      originalDays: job.tripDurationDays,
      adjustedToDays: finalTripDays,
      reason: `Requested ${job.tripDurationDays} days (${requestedKmPerDay} km/day) adjusted to ${finalTripDays} days (${adjustedKmPerDay} km/day) to match ${tripTravelPace} pace.`,
    }
    console.log("[4/4] Days auto-adjusted", daysAdjustment)
  }

  const organizationDistanceKm = customRouteDistanceKm ?? estimatedDriveDistanceKm

  console.log("[organizeStopsByDay] CLIENT → SERVER: Sending preferences to organizeStopsByDay:", {
    tripId: job.tripId,
    stayPreference: job.stayPreference,
    budgetPreference: job.budgetPreference,
    avoidGravelRoads: job.avoidGravelRoads,
    petFriendlyRequired: job.petFriendlyRequired,
    rigType: job.rigType,
    rigLengthM: job.rigLengthM,
    endDate: job.endDate,
    tripDurationDays: job.tripDurationDays,
  })

  await organizeStopsByDay(
    job.tripId,
    job.startLat,
    job.startLng,
    job.destLat,
    job.destLng,
    finalTripDays,
    organizationDistanceKm,
    {
      stay_preference: job.stayPreference,
      budget_preference: job.budgetPreference,
      avoid_gravel_roads: job.avoidGravelRoads,
      pet_friendly_required: job.petFriendlyRequired,
      rig_type: job.rigType,
      rig_length_m: job.rigLengthM,
      end_date: job.endDate,
      trip_duration_days: job.tripDurationDays,
    },
    encodedPolyline,
    process.env.NEXT_PUBLIC_GMAPS_API_KEY,
  )

  // Generate and save narrative into the v1 itinerary record created above
  try {
    const { narrative } = await generateNarrativeForTrip(job.tripId)

    const { data: activeItinerary } = await supabaseAdmin
      .from("trip_itineraries")
      .select("id")
      .eq("trip_id", job.tripId)
      .eq("status", "active")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (activeItinerary?.id) {
      await supabaseAdmin
        .from("trip_itineraries")
        .update({ itinerary_json: narrative })
        .eq("id", activeItinerary.id)
    }

    // Also patch route_data_json for fast loading
    const { data: tripDataRow } = await supabaseAdmin
      .from("trips")
      .select("route_data_json")
      .eq("id", job.tripId)
      .single()

    const existingJson = (tripDataRow?.route_data_json as Record<string, unknown>) ?? {}
    await supabaseAdmin
      .from("trips")
      .update({ route_data_json: { ...existingJson, narrative } })
      .eq("id", job.tripId)
  } catch (err) {
    console.error("[narrative] Failed to generate initial narrative for trip", job.tripId, err)
  }

  const { data: tripRouteDataRow } = await supabaseAdmin
    .from("trips")
    .select("route_data_json")
    .eq("id", job.tripId)
    .single()

  const existingRouteDataJson = (tripRouteDataRow?.route_data_json as Record<string, unknown>) ?? {}

  await supabaseAdmin
    .from("trips")
    .update({
      status: "completed",
      trip_duration_days: finalTripDays,
      route_data_json: daysAdjustment
        ? { ...existingRouteDataJson, daysAdjustment }
        : existingRouteDataJson,
    })
    .eq("id", job.tripId)

  console.log("[4/4] Trip generation completed", {
    tripId: job.tripId,
    totalStops: generatedStopsCount + customStopsCount,
    suggestedDays,
  })
}






export async function GET(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
      )
    }

    const { searchParams } = new URL(req.url)
    const userId = searchParams.get("user_id")

    let query = supabaseAdmin
      .from("trips")
      .select("*")
      .order("created_at", { ascending: false })

    if (userId) {
      query = query.eq("user_id", userId)
    }

    const { data, error } = await query

    if (error) {
      console.error("Database error:", error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      trips: data,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}

// 📏 Distance → Base Stops (Returns base number of stops based on distance only)
export function getBaseStops(distanceKm: number): number {
  if (distanceKm < 80) return 0;
  if (distanceKm < 200) return 1;
  if (distanceKm < 400) return 2;
  if (distanceKm < 700) return 3;
  if (distanceKm < 1000) return 4;
  if (distanceKm < 1500) return 5;
  return Math.round(distanceKm / 250);
}

// 📅 Days → Adjustment (Adds extra stops based on trip length
export function getDayBonus(days: number): number {
  if (days <= 3) return 0;
  if (days <= 5) return 1;
  if (days <= 8) return 2;
  if (days <= 12) return 3;
  return 4;
}

// 🚧 Max Stops Allowed by Route
export function getMaxStops(distanceKm: number): number {
  return Math.floor(distanceKm / 120);
}

export function isValidLat(lat: unknown): boolean {
  const n = Number(lat);
  return Number.isFinite(n) && n >= -90 && n <= 90;
}

export function isValidLng(lng: unknown): boolean {
  const n = Number(lng);
  return Number.isFinite(n) && n >= -180 && n <= 180;
}

export function hasValidCoords(
  startLat: unknown,
  startLng: unknown,
  destLat: unknown,
  destLng: unknown
): boolean {
  return (
    isValidLat(startLat) &&
    isValidLng(startLng) &&
    isValidLat(destLat) &&
    isValidLng(destLng)
  );
}

export async function POST(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
      )
    }

    const body = await req.json()

    const {
      userId,
      title,
      startLocation,
      destination,
      startLat,
      startLng,
      destLat,
      destLng,
      tripDurationDays,
      travelPace,
      rigType,
      rigLengthM,
      petFriendlyRequired,
      stayPreference,
      avoidGravelRoads,
      budgetPreference,
      notes,
      endDate,
      status = "planned",
    } = body

    let resolvedStartLat = startLat
    let resolvedStartLng = startLng
    let resolvedDestLat = destLat
    let resolvedDestLng = destLng

    const startLatNum = Number(startLat)
    const startLngNum = Number(startLng)
    const destLatNum = Number(destLat)
    const destLngNum = Number(destLng)

    const userProvidedCoordsValid =
      Number.isFinite(startLatNum) &&
      Number.isFinite(startLngNum) &&
      Number.isFinite(destLatNum) &&
      Number.isFinite(destLngNum) &&
      startLatNum >= -90 && startLatNum <= 90 &&
      destLatNum >= -90 && destLatNum <= 90 &&
      startLngNum >= -180 && startLngNum <= 180 &&
      destLngNum >= -180 && destLngNum <= 180

    if (userProvidedCoordsValid) {
      const startInAu = isWithinAustralia(startLatNum, startLngNum)
      const destInAu = isWithinAustralia(destLatNum, destLngNum)

      if (!startInAu || !destInAu) {
        const [startGeo, destGeo] = await Promise.all([
          geocodeWithAustraliaBias(startLocation),
          geocodeWithAustraliaBias(destination),
        ])

        if (startGeo && destGeo) {
          resolvedStartLat = startGeo.lat
          resolvedStartLng = startGeo.lng
          resolvedDestLat = destGeo.lat
          resolvedDestLng = destGeo.lng

          console.log("[0/4] 🧭 Corrected ambiguous coordinates using AU-biased geocoding", {
            startLocation,
            destination,
            correctedStart: [resolvedStartLat, resolvedStartLng],
            correctedDestination: [resolvedDestLat, resolvedDestLng],
          })
        } else {
          return NextResponse.json(
            {
              success: false,
              error: "Could not resolve locations to Australia. Please include state/country (for example: Kenilworth QLD, Australia).",
            },
            { status: 400 }
          )
        }
      }
    } else if (!userProvidedCoordsValid) {
      const [startGeo, destGeo] = await Promise.all([
        geocodeWithAustraliaBias(startLocation),
        geocodeWithAustraliaBias(destination),
      ])

      if (startGeo && destGeo) {
        resolvedStartLat = startGeo.lat
        resolvedStartLng = startGeo.lng
        resolvedDestLat = destGeo.lat
        resolvedDestLng = destGeo.lng

        console.log("[0/4] 🧭 Geocoded from place names", {
          startLocation,
          destination,
          startCoords: [resolvedStartLat, resolvedStartLng],
          destCoords: [resolvedDestLat, resolvedDestLng],
        })
      } else {
        return NextResponse.json(
          {
            success: false,
            error: "Could not resolve locations. Please provide valid coordinates or specific Australian addresses (e.g., 'Port Augusta SA').",
          },
          { status: 400 }
        )
      }
    }

    if (!userId || !title || !startLocation || !destination || !tripDurationDays) {
      return NextResponse.json(
        { success: false, error: "userId, title, start location, destination, and duration are required" },
        { status: 400 }
      )
    }

    // Ensure user exists in users table (handles DB reset scenario)
    const { data: existingUser } = await supabaseAdmin
      .from("users")
      .select("id, metadata")
      .eq("id", userId)
      .single()

    const incomingDefaults = {
      travelPace: travelPace ?? null,
      rigType: rigType ?? null,
      rigLengthM: rigLengthM ?? null,
      petFriendlyRequired: petFriendlyRequired ?? false,
      avoidGravelRoads: avoidGravelRoads ?? false,
      stayPreference: stayPreference ?? null,
      budgetPreference: budgetPreference ?? null,
    }

    if (!existingUser) {
      const { error: userError } = await supabaseAdmin
        .from("users")
        .insert({
          id: userId,
          email: `user-${userId}@trackmate.local`,
          role: "customer",
          metadata: {
            defaults: incomingDefaults,
          },
          created_at: new Date().toISOString(),
        })

      if (userError) {
        console.error("Failed to ensure user exists:", userError)
        return NextResponse.json(
          { success: false, error: "Failed to create user record: " + userError.message },
          { status: 500 }
        )
      }
    } else {
      const metadata = (existingUser.metadata as UserMetadata | null) ?? {}
      const currentDefaults = metadata.defaults ?? {}
      const mergedDefaults = {
        travelPace: currentDefaults.travelPace ?? incomingDefaults.travelPace,
        rigType: currentDefaults.rigType ?? incomingDefaults.rigType,
        rigLengthM: currentDefaults.rigLengthM ?? incomingDefaults.rigLengthM,
        petFriendlyRequired: currentDefaults.petFriendlyRequired ?? incomingDefaults.petFriendlyRequired,
        avoidGravelRoads: currentDefaults.avoidGravelRoads ?? incomingDefaults.avoidGravelRoads,
        stayPreference: currentDefaults.stayPreference ?? incomingDefaults.stayPreference,
        budgetPreference: currentDefaults.budgetPreference ?? incomingDefaults.budgetPreference,
      }

      const defaultUpdates: Record<string, unknown> = {}
      if (JSON.stringify(currentDefaults) !== JSON.stringify(mergedDefaults)) {
        defaultUpdates.metadata = {
          ...metadata,
          defaults: mergedDefaults,
        }
      }

      if (Object.keys(defaultUpdates).length > 0) {
        defaultUpdates.updated_at = new Date().toISOString()
        const { error: defaultUpdateError } = await supabaseAdmin
          .from("users")
          .update(defaultUpdates)
          .eq("id", userId)

        if (defaultUpdateError) {
          console.error("Failed to initialize user defaults:", defaultUpdateError)
        }
      }
    }

    // ============================================================
    // [1/4] INSERT TRIP RECORD TO DB
    // ============================================================
    console.log("[1/4] 📝 Creating trip record...", {
      title,
      startLocation,
      destination,
      userId,
    })

    const { data, error } = await createTrip({
      userId,
      title,
      startLocation,
      destination,
      startLat: resolvedStartLat,
      startLng: resolvedStartLng,
      destLat: resolvedDestLat,
      destLng: resolvedDestLng,
      tripDurationDays,
      travelPace,
      rigType,
      rigLengthM,
      petFriendlyRequired,
      stayPreference,
      avoidGravelRoads,
      budgetPreference,
      notes,
      endDate,
      status,
      plannerInput: body,
    })

    if (error) {
      console.error("[1/4] ❌ Failed to create trip:", error)
      return NextResponse.json(
        { success: false, error: "Failed to create trip: " + error.message },
        { status: 500 }
      )
    }

    console.log(`[1/4] ✅ Trip created successfully`, {
      tripId: data?.id,
      title: data?.title,
    })

    if (!data?.id) {
      return NextResponse.json(
        { success: false, error: "Failed to create trip id" },
        { status: 500 }
      )
    }

    const hasResolvedCoords = hasValidCoords(resolvedStartLat, resolvedStartLng, resolvedDestLat, resolvedDestLng);

    if (!hasResolvedCoords) {
      return NextResponse.json(
        { success: false, error: "Trip created but missing valid coordinates for planning" },
        { status: 400 }
      )
    }

    await supabaseAdmin
      .from("trips")
      .update({ status: "in_progress" })
      .eq("id", data.id)

    const safeTravelPace: TravelPace = (travelPace === "fast" || travelPace === "moderate") ? travelPace : "leisurely"

    const job: TripGenerationJob = {
      tripId: data.id,
      userId,
      title: data.title,
      startLat: Number(resolvedStartLat),
      startLng: Number(resolvedStartLng),
      destLat: Number(resolvedDestLat),
      destLng: Number(resolvedDestLng),
      tripDurationDays: Number(tripDurationDays) || 1,
      travelPace: safeTravelPace,
      stayPreference: stayPreference ?? null,
      budgetPreference: budgetPreference ?? null,
      avoidGravelRoads: avoidGravelRoads ?? false,
      petFriendlyRequired: petFriendlyRequired ?? false,
      rigType: rigType ?? null,
      rigLengthM: rigLengthM ?? null,
      endDate: endDate ?? null,
    }

    console.log("[after] Scheduling trip generation for", data.id)

    after(async () => {
      try {
        await processTripGenerationJob(job)
      } catch (error) {
        console.error("[after] ❌ Trip generation failed", {
          tripId: job.tripId,
          error: error instanceof Error ? error.message : String(error),
        })
        if (supabaseAdmin) {
          await supabaseAdmin
            .from("trips")
            .update({ status: "planned" })
            .eq("id", job.tripId)
        }
      }
    })

    return NextResponse.json(
      {
        success: true,
        message: `Trip "${title}" queued for planning`,
        tripId: data.id,
        status: "in_progress",
      },
      { status: 202 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
