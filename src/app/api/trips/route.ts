import { supabaseAdmin } from "@/config/supabase"
import { NextRequest, NextResponse } from "next/server"

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

interface GenerateStopResult {
  success: boolean
  stops: Array<Record<string, unknown>>
  totalCandidates?: number
  afterProximity?: number
  afterCorridor?: number
  error?: string
}

interface GenerateCustomStopResult {
  success: boolean
  stopsGenerated: number
  totalFetched?: number
  afterDedup?: number
  error?: string
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

// Haversine formula to calculate distance between two coordinates
function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371 // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
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
    const response = await fetch(url)
    const data = await response.json()
    const results = Array.isArray(data?.results) ? data.results : []
    if (results.length === 0) return null

    const australianResult = results.find((result: { address_components?: Array<{ short_name?: string; types?: string[] }>; geometry?: { location?: { lat?: number; lng?: number } }; formatted_address?: string }) => {
      const country = extractCountryCode(result.address_components || [])
      return country === "AU"
    }) || results[0]

    const lat = Number(australianResult?.geometry?.location?.lat)
    const lng = Number(australianResult?.geometry?.location?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

    return {
      lat,
      lng,
      formattedAddress: australianResult.formatted_address,
    }
  } catch {
    return null
  }
}

function pickSpacedStops<T extends { distance_from_start_km: number }>(
  sortedStops: T[],
  minSpacingKm: number,
  maxCount: number
): T[] {
  const picked: T[] = []

  for (const stop of sortedStops) {
    if (picked.length >= maxCount) break

    const isFarEnough = picked.every(
      (existing) =>
        Math.abs(existing.distance_from_start_km - stop.distance_from_start_km) >= minSpacingKm
    )

    if (isFarEnough) picked.push(stop)
  }

  // Fallback: if strict spacing rejects too many, fill remaining slots by order.
  if (picked.length < Math.min(maxCount, sortedStops.length)) {
    for (const stop of sortedStops) {
      if (picked.length >= maxCount) break
      if (!picked.some((p) => p.distance_from_start_km === stop.distance_from_start_km)) {
        picked.push(stop)
      }
    }
  }

  return picked
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

function buildCustomStopKey(locationName: string, latitude: string, longitude: string): string {
  const latNum = Number(latitude)
  const lngNum = Number(longitude)
  if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
    return `${normalizeName(locationName)}|${latNum.toFixed(5)}|${lngNum.toFixed(5)}`
  }
  return `${normalizeName(locationName)}|${latitude}|${longitude}`
}

// Generate stops from database with filtering
async function generateStop(
  startLat: number,
  startLng: number,
  destLat: number,
  destLng: number
): Promise<GenerateStopResult> {
  if (!supabaseAdmin) {
    return {
      success: false,
      stops: [],
      error: "Database not configured",
    }
  }

  try {
    // Calculate bounding box: ±1 degree from start/dest
    const minLat = Math.min(startLat, destLat) - 1
    const maxLat = Math.max(startLat, destLat) + 1
    const minLng = Math.min(startLng, destLng) - 1
    const maxLng = Math.max(startLng, destLng) + 1

    // Query stops table with bounding box
    const { data: allStops, error: queryError } = await supabaseAdmin
      .from("stops")
      .select("*")
      .gte("latitude", minLat)
      .lte("latitude", maxLat)
      .gte("longitude", minLng)
      .lte("longitude", maxLng)

    if (queryError) {
      return {
        success: false,
        stops: [],
        error: queryError.message,
      }
    }

    if (!allStops || allStops.length === 0) {
      console.log("[2/4] generateStop diagnostics", {
        totalCandidates: 0,
        afterProximity: 0,
        afterCorridor: 0,
      })

      return {
        success: true,
        stops: [],
        totalCandidates: 0,
        afterProximity: 0,
        afterCorridor: 0,
      }
    }

    // Calculate direct distance between start and destination
    const directDistance = calculateDistance(startLat, startLng, destLat, destLng)

    // Filter and enrich stops with distance calculations
    const enrichedStops = allStops
      .map((stop) => {
        const distFromStart = calculateDistance(startLat, startLng, stop.latitude, stop.longitude)
        const distFromDest = calculateDistance(stop.latitude, stop.longitude, destLat, destLng)
        const distanceToRoute = Math.min(distFromStart, distFromDest)
        const isBetweenStartAndDest = distFromStart + distFromDest <= directDistance + 50

        return {
          ...stop,
          distance_from_start_km: Math.round(distFromStart * 10) / 10,
          distance_to_dest_km: Math.round(distFromDest * 10) / 10,
          distance_to_route_km: Math.round(distanceToRoute * 10) / 10,
          is_between_start_and_dest: isBetweenStartAndDest,
        }
      })

    // Filter: proximity (<=100km from route)
    const afterProximity = enrichedStops.filter((stop) => stop.distance_to_route_km <= 100)
    const rejectedByProximity = enrichedStops.filter((stop) => stop.distance_to_route_km > 100)

    // Filter: corridor (between-ness logic)
    const afterCorridor = afterProximity.filter((stop) => stop.is_between_start_and_dest)
    const rejectedByCorridor = afterProximity.filter((stop) => !stop.is_between_start_and_dest)

    const orderedStops = afterCorridor
      // Sort by distance from start
      .sort((a, b) => a.distance_from_start_km - b.distance_from_start_km)

    const targetPlannedStops = Math.max(2, Math.min(8, Math.round(directDistance / 220)))
    const minSpacingKm = Math.max(60, Math.round(directDistance / (targetPlannedStops + 1) * 0.5))
    const filteredStops = pickSpacedStops(orderedStops, minSpacingKm, targetPlannedStops)

    console.log("[2/4] generateStop diagnostics", {
      totalCandidates: allStops.length,
      rejectedByProximity: rejectedByProximity.length,
      afterProximity: afterProximity.length,
      rejectedByCorridor: rejectedByCorridor.length,
      afterCorridor: afterCorridor.length,
      plannedStops: filteredStops.length,
      targetPlannedStops,
      minSpacingKm,
    })

    if (rejectedByProximity.length > 0) {
      console.log("[2/4] rejected by proximity (>100km)", {
        count: rejectedByProximity.length,
        sample: rejectedByProximity.slice(0, 3).map((s) => ({
          id: s.id,
          name: s.location_name,
          distance_to_route_km: s.distance_to_route_km,
        })),
      })
    }

    if (rejectedByCorridor.length > 0) {
      console.log("[2/4] rejected by corridor", {
        count: rejectedByCorridor.length,
        sample: rejectedByCorridor.slice(0, 3).map((s) => ({
          id: s.id,
          name: s.location_name,
          distance_from_start_km: s.distance_from_start_km,
          distance_to_dest_km: s.distance_to_dest_km,
        })),
      })
    }

    return {
      success: true,
      stops: filteredStops,
      totalCandidates: allStops.length,
      afterProximity: afterProximity.length,
      afterCorridor: afterCorridor.length,
    }
  } catch (error) {
    return {
      success: false,
      stops: [],
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// Generate custom stops from Google Places
async function generateCustomStop(
  startLat: number,
  startLng: number,
  destLat: number,
  destLng: number,
  tripId: string,
  tripDurationDays: number,
  existingStopDistancesKm: number[] = [],
  requestedCustomStops = 0
): Promise<GenerateCustomStopResult> {
  if (!supabaseAdmin) {
    return {
      success: false,
      stopsGenerated: 0,
      error: "Database not configured",
    }
  }

  try {
    const safeTripDays = Math.max(1, Math.round(Number(tripDurationDays) || 1))
    if (safeTripDays <= 1) {
      console.log("[3/4] Skipping auto custom stop generation for one-day trip")
      return {
        success: true,
        stopsGenerated: 0,
        totalFetched: 0,
        afterDedup: 0,
      }
    }

    const apiKey = process.env.NEXT_PUBLIC_GMAPS_API_KEY
    if (!apiKey) {
      return {
        success: false,
        stopsGenerated: 0,
        error: "Google Maps API key not configured",
      }
    }

    const directDistanceKmForProbes = calculateDistance(startLat, startLng, destLat, destLng)

    // More probe points for longer routes. Remote routes need a wider search net.
    const baseProbeCount = Math.max(4, Math.ceil(directDistanceKmForProbes / 150))
    const probeCount = directDistanceKmForProbes > 2000 ? Math.min(50, baseProbeCount) : Math.min(30, baseProbeCount)
    const probePoints = Array.from({ length: probeCount }, (_, i) => {
      const fraction = (i + 1) / (probeCount + 1)
      return {
        lat: startLat + (destLat - startLat) * fraction,
        lng: startLng + (destLng - startLng) * fraction,
      }
    })

    // Irrelevant name patterns to exclude from overnight stop options
    const OVERNIGHT_EXCLUDE = /hotel|motel|hostel|backpacker|resort|inn\b|b&b|bed and breakfast|airbnb/i

    // Search config: [type, keyword, radius]
    // rv_park is Google's type for caravan parks; campground covers national park camps.
    // Use a larger radius for remote Australian searches so sparse outback routes still return results.
    const overnightSearches: Array<{ type: string; keyword?: string; radius: number }> = [
      { type: "rv_park", radius: directDistanceKmForProbes > 1000 ? 80000 : 40000 },
      { type: "campground", radius: directDistanceKmForProbes > 1000 ? 80000 : 40000 },
      { type: "rv_park", keyword: "caravan park", radius: 50000 },
      { type: "campground", keyword: "free camp", radius: directDistanceKmForProbes > 1000 ? 80000 : 50000 },
      { type: "campground", keyword: "roadhouse", radius: directDistanceKmForProbes > 1000 ? 80000 : 50000 },
    ]

    if (directDistanceKmForProbes > 1000) {
      overnightSearches.push(
        { type: "parking", radius: 80000 },
        { type: "gas_station", keyword: "truck stop", radius: 80000 },
        { type: "point_of_interest", keyword: "rest area", radius: 80000 }
      )
    }

    const seenPlaces = new Set<string>()
    const customStopCandidates: Array<Record<string, unknown> & { distance_from_start_km: number }> = []
    let totalFetched = 0

    // Search at each probe point for overnight stops (caravan parks, campgrounds)
    for (const point of probePoints) {
      for (const search of overnightSearches) {
        try {
          const params = new URLSearchParams({
            location: `${point.lat},${point.lng}`,
            radius: String(search.radius),
            type: search.type,
            key: apiKey,
          })
          if (search.keyword) params.set("keyword", search.keyword)

          const response = await fetch(
            `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`
          )

          const data = await response.json()
          if (data.results) {
            totalFetched += data.results.length
            const maxResultsPerSearch = directDistanceKmForProbes > 1000 ? 20 : 10
            data.results.slice(0, maxResultsPerSearch).forEach((place: Record<string, unknown>) => {
              const name = String(place.name ?? "")
              // Skip irrelevant accommodation types (hotels, motels, etc.)
              if (OVERNIGHT_EXCLUDE.test(name)) return

              const geometry = place.geometry as {
                location?: { lat?: number; lng?: number }
              } | null
              const lat = Number(geometry?.location?.lat ?? 0)
              const lng = Number(geometry?.location?.lng ?? 0)
              if (!lat || !lng) return

              const key = `${name.toLowerCase().trim()}|${lat.toFixed(4)}|${lng.toFixed(4)}`
              if (!seenPlaces.has(key)) {
                seenPlaces.add(key)
                const distanceFromStart = calculateDistance(startLat, startLng, lat, lng)

                customStopCandidates.push({
                  trip_id: tripId,
                  location_name: name,
                  latitude: String(lat),
                  longitude: String(lng),
                  place_type: "campground",
                  distance_from_start_km: Math.round(distanceFromStart * 10) / 10,
                })
              }
            })
          }
        } catch (error) {
          console.warn(`Failed to search ${search.type} at probe point:`, error)
        }
      }
    }

    const directDistanceKm = directDistanceKmForProbes
    // Use the explicit requestedCustomStops passed from trip handler, with fallback to distance-based calc
    const targetCustomStops = requestedCustomStops > 0
      ? requestedCustomStops
      : Math.max(2, Math.min(10, Math.round(directDistanceKm / 180)))

    const orderedCustomCandidates = [...customStopCandidates].sort(
      (a, b) => a.distance_from_start_km - b.distance_from_start_km
    )
    // Dynamic initial spacing based on route length and target
    const initialSpacingKm = Math.max(20, Math.ceil(directDistanceKm / (targetCustomStops + Math.ceil(targetCustomStops * 0.2))))
    const plannedCustomCandidates = pickSpacedStops(orderedCustomCandidates, initialSpacingKm, targetCustomStops)

    // If initial spacing doesn't hit quota, progressively relax constraints
    if (plannedCustomCandidates.length < targetCustomStops && customStopCandidates.length > plannedCustomCandidates.length) {
      const selectedKeys = new Set(
        plannedCustomCandidates.map((s) =>
          buildCustomStopKey(String(s.location_name || ""), String(s.latitude || ""), String(s.longitude || ""))
        )
      )

      const addMoreCandidates = (candidates: typeof customStopCandidates, minSpacingKm: number) => {
        for (const candidate of candidates) {
          if (plannedCustomCandidates.length >= targetCustomStops) break
          const key = buildCustomStopKey(String(candidate.location_name || ""), String(candidate.latitude || ""), String(candidate.longitude || ""))
          if (selectedKeys.has(key)) continue
          const farEnough = plannedCustomCandidates.every((p) => Math.abs(p.distance_from_start_km - candidate.distance_from_start_km) >= minSpacingKm)
          if (!farEnough) continue
          plannedCustomCandidates.push(candidate)
          selectedKeys.add(key)
        }
      }

      // Pass 1: Relaxed spacing (60% of initial), still using no-overlap candidates
      const pass1Spacing = Math.max(10, Math.ceil(initialSpacingKm * 0.6))
      addMoreCandidates(customStopCandidates.filter((c) => existingStopDistancesKm.every((d) => Math.abs(c.distance_from_start_km - d) >= 60)), pass1Spacing)

      // Pass 2: Even more relaxed (40% initial), reduce DB overlap to 25km
      if (plannedCustomCandidates.length < targetCustomStops) {
        const pass2Spacing = Math.max(8, Math.ceil(initialSpacingKm * 0.4))
        addMoreCandidates(customStopCandidates.filter((c) => existingStopDistancesKm.every((d) => Math.abs(c.distance_from_start_km - d) >= 25)), pass2Spacing)
      }

      // Pass 3: Tight spacing (25% initial), minimal DB overlap (15km)
      if (plannedCustomCandidates.length < targetCustomStops) {
        const pass3Spacing = Math.max(5, Math.ceil(initialSpacingKm * 0.25))
        addMoreCandidates(customStopCandidates.filter((c) => existingStopDistancesKm.every((d) => Math.abs(c.distance_from_start_km - d) >= 15)), pass3Spacing)
      }

      // Pass 4: Final fallback with very loose spacing (3km)
      if (plannedCustomCandidates.length < targetCustomStops) {
        addMoreCandidates(customStopCandidates, 3)
      }

      if (plannedCustomCandidates.length >= targetCustomStops) {
        console.log(`[3/4] Adaptive fallback filled to ${plannedCustomCandidates.length} stops (target: ${targetCustomStops})`)
      } else {
        console.log(`[3/4] Adaptive fallback partially filled: ${plannedCustomCandidates.length} of ${targetCustomStops} (initial spacing: ${initialSpacingKm}km)`)
      }
    }
    const customStopsToInsert = plannedCustomCandidates.map((candidate) => {
      const progress = directDistanceKm > 0
        ? Math.max(0, Math.min(0.999, Number(candidate.distance_from_start_km) / directDistanceKm))
        : 0
      const dayIndex = Math.min(safeTripDays - 1, Math.floor(progress * safeTripDays))

      return {
        trip_id: candidate.trip_id,
        location_name: candidate.location_name,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        place_type: candidate.place_type,
        day_index: dayIndex,
      }
    })

    // Deduplicate generated custom stops before touching DB.
    const uniqueCustomStops = [] as typeof customStopsToInsert
    const seenKeys = new Set<string>()
    for (const stop of customStopsToInsert) {
      const key = buildCustomStopKey(stop.location_name as string, stop.latitude as string, stop.longitude as string)
      if (seenKeys.has(key)) continue
      seenKeys.add(key)
      uniqueCustomStops.push(stop)
    }

    let insertedCustomStopsCount = 0

    // Save planned custom stops to custom_stops table
    if (uniqueCustomStops.length > 0) {
      const { data: existingCustomStops, error: existingError } = await supabaseAdmin
        .from("custom_stops")
        .select("location_name, latitude, longitude")
        .eq("trip_id", tripId)

      if (existingError) {
        return {
          success: false,
          stopsGenerated: 0,
          totalFetched,
          afterDedup: customStopCandidates.length,
          error: existingError.message,
        }
      }

      const existingKeys = new Set(
        (existingCustomStops || []).map((stop) =>
          buildCustomStopKey(stop.location_name, stop.latitude, stop.longitude)
        )
      )

      const finalCustomStopsToInsert = uniqueCustomStops.filter((stop) => {
        const key = buildCustomStopKey(stop.location_name as string, stop.latitude as string, stop.longitude as string)
        return !existingKeys.has(key)
      })

      if (finalCustomStopsToInsert.length > 0) {
        const { error: insertError } = await supabaseAdmin
          .from("custom_stops")
          .insert(finalCustomStopsToInsert)

        if (insertError) {
          console.log("[3/4] generateCustomStop diagnostics", {
            totalFetched,
            afterDedup: customStopCandidates.length,
            planned: finalCustomStopsToInsert.length,
            inserted: 0,
          })

          return {
            success: false,
            stopsGenerated: 0,
            totalFetched,
            afterDedup: customStopCandidates.length,
            error: insertError.message,
          }
        }

        insertedCustomStopsCount = finalCustomStopsToInsert.length
      }

      console.log("[3/4] custom stop dedupe", {
        generated: customStopsToInsert.length,
        uniqueGenerated: uniqueCustomStops.length,
        existingInDb: (existingCustomStops || []).length,
        insertedNew: insertedCustomStopsCount,
        targetCustomStops,
        tripDurationDays: safeTripDays,
      })
    }

    console.log("[3/4] generateCustomStop diagnostics", {
      totalFetched,
      afterDedup: customStopCandidates.length,
      planned: uniqueCustomStops.length,
      inserted: insertedCustomStopsCount,
      targetCustomStops,
      directDistanceKm: Math.round(directDistanceKm),
    })

    return {
      success: true,
      stopsGenerated: insertedCustomStopsCount,
      totalFetched,
      afterDedup: customStopCandidates.length,
    }
  } catch (error) {
    return {
      success: false,
      stopsGenerated: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
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

    const hasAllCoords =
      Number.isFinite(Number(startLat)) &&
      Number.isFinite(Number(startLng)) &&
      Number.isFinite(Number(destLat)) &&
      Number.isFinite(Number(destLng))

    if (hasAllCoords) {
      const startInAu = isWithinAustralia(Number(startLat), Number(startLng))
      const destInAu = isWithinAustralia(Number(destLat), Number(destLng))

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

    let generatedStopsCount = 0
    let customStopsCount = 0

    if (data?.id && resolvedStartLat && resolvedStartLng && resolvedDestLat && resolvedDestLng) {
      // ============================================================
      // [2/4] GENERATE STOPS FROM DATABASE
      // ============================================================
      console.log("[2/4] 🔍 Generating stops from DB...", {
        startCoords: [resolvedStartLat, resolvedStartLng],
        destCoords: [resolvedDestLat, resolvedDestLng],
      })

      const { success: generateSuccess, stops = [], error: generateError } = await generateStop(
        resolvedStartLat,
        resolvedStartLng,
        resolvedDestLat,
        resolvedDestLng
      )

      if (generateError) {
        console.warn("[2/4] ⚠️ Stop generation warning:", generateError)
      }

      if (generateSuccess && stops.length > 0) {
        console.log(`[2/4] 📍 Found ${stops.length} filtered stops from DB`)

        // Format and save to trip_candidate_stops
        const candidateRows = stops.map((stop, index) => {
          const stopData = stop as {
            id: string
            distance_to_route_km: number
            distance_from_start_km: number
            distance_to_dest_km: number
            is_between_start_and_dest: boolean
          }

          return {
          trip_id: data.id,
          stop_id: stopData.id,
          rank_score: index + 1,
          distance_to_route_km: stopData.distance_to_route_km,
          detour_minutes: null,
          suitability_json: {
            distance_from_start: stopData.distance_from_start_km,
            distance_to_dest: stopData.distance_to_dest_km,
            is_between: stopData.is_between_start_and_dest,
          },
          generation_version: 1,
          }
        })

        // Ensure each stop_id is only saved once per trip generation.
        const uniqueCandidateRows = Array.from(
          new Map(candidateRows.map((row) => [row.stop_id, row])).values()
        )

        const { error: insertError } = await supabaseAdmin
          .from("trip_candidate_stops")
          .upsert(uniqueCandidateRows, {
            onConflict: "trip_id,stop_id,generation_version",
          })

        if (insertError) {
          console.error("[2/4] ❌ Failed to save candidate stops:", insertError)
        } else {
          generatedStopsCount = uniqueCandidateRows.length
          console.log(`[2/4] ✅ Saved ${generatedStopsCount} stops to trip_candidate_stops table`)
        }
      } else {
        console.log("[2/4] ⓘ No stops found or generation failed")
      }

      // ============================================================
      // [3/4] GENERATE CUSTOM STOPS FROM GOOGLE PLACES
      // ============================================================
      console.log("[3/4] 🌐 Generating custom stops from Google Places...", {
        searchTypes: ["rv_park", "campground", "caravan park keyword"],
      })

      const dbStopDistancesKm = stops
        .map((stop) => (stop as { distance_from_start_km?: number }).distance_from_start_km ?? 0)
        .filter((distance) => distance > 0)

      const safeTripDays = Math.max(1, Math.round(Number(tripDurationDays) || 1))
      const targetTotalStops = safeTripDays * 3
      const customStopsNeeded = Math.max(0, targetTotalStops - generatedStopsCount)

      console.log("[3/4] target stop quota", {
        tripDurationDays: safeTripDays,
        targetTotalStops,
        dbStops: generatedStopsCount,
        googleStopsNeeded: customStopsNeeded,
      })

      const {
        success: customSuccess,
        stopsGenerated = 0,
        totalFetched = 0,
        afterDedup = 0,
        error: customError,
      } =
        await generateCustomStop(
          resolvedStartLat,
          resolvedStartLng,
          resolvedDestLat,
          resolvedDestLng,
          data.id,
          Number(tripDurationDays) || 1,
          dbStopDistancesKm,
          customStopsNeeded
        )

      if (customError) {
        console.warn("[3/4] ⚠️ Custom stop generation warning:", customError)
      }

      if (customSuccess) {
        customStopsCount = stopsGenerated
        console.log(
          `[3/4] ✅ Generated and saved ${customStopsCount} custom stops to custom_stops table`,
          {
            totalFetched,
            afterDedup,
          }
        )
      } else {
        console.log("[3/4] ⓘ Custom stop generation skipped or failed", {
          totalFetched,
          afterDedup,
        })
      }
    }

    // ============================================================
    // [4/4] RETURN RESPONSE TO CLIENT
    // ============================================================
    console.log("[4/4] 📤 Returning response to client...", {
      tripId: data?.id,
      totalStopsGenerated: generatedStopsCount + customStopsCount,
    })

    return NextResponse.json({
      success: true,
      message: `✅ Trip "${title}" created successfully!`,
      tripId: data?.id,
      stopsGenerated: {
        databaseStops: generatedStopsCount,
        customStops: customStopsCount,
        total: generatedStopsCount + customStopsCount,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
