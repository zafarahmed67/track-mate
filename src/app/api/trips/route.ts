// import { supabaseAdmin } from "@/config/supabase"
// import { NextRequest, NextResponse } from "next/server"
// import { decodePolyline, buildCumulativeDistanceTable, samplePolylineAtKm, projectPointOntoPolyline } from "@/lib/routePolyline"
// import { env } from "@/config/env.config"

// interface UserMetadata {
//   defaults?: {
//     travelPace?: string | null
//     rigType?: string | null
//     rigLengthM?: number | null
//     petFriendlyRequired?: boolean
//     avoidGravelRoads?: boolean
//     stayPreference?: string | null
//     budgetPreference?: string | null
//   }
//   [key: string]: unknown
// }

// interface CreateTripParams {
//   userId: string
//   title: string
//   startLocation: string
//   destination: string
//   startLat?: number | null
//   startLng?: number | null
//   destLat?: number | null
//   destLng?: number | null
//   tripDurationDays: number
//   travelPace?: string | null
//   rigType?: string | null
//   rigLengthM?: number | null
//   petFriendlyRequired?: boolean
//   stayPreference?: string | null
//   avoidGravelRoads?: boolean
//   budgetPreference?: string | null
//   notes?: string | null
//   endDate?: string | null
//   status?: string
//   plannerInput: unknown
// }

// interface GenerateStopResult {
//   success: boolean
//   stops: Array<Record<string, unknown>>
//   totalCandidates?: number
//   afterProximity?: number
//   afterCorridor?: number
//   error?: string
// }

// interface GenerateCustomStopResult {
//   success: boolean
//   stopsGenerated: number
//   totalFetched?: number
//   afterDedup?: number
//   error?: string
// }

// async function createTrip(params: CreateTripParams) {
//   if (!supabaseAdmin) {
//     return {
//       data: null,
//       error: { message: "Database not configured" },
//     }
//   }

//   const {
//     userId,
//     title,
//     startLocation,
//     destination,
//     startLat,
//     startLng,
//     destLat,
//     destLng,
//     tripDurationDays,
//     travelPace,
//     rigType,
//     rigLengthM,
//     petFriendlyRequired,
//     stayPreference,
//     avoidGravelRoads,
//     budgetPreference,
//     notes,
//     endDate,
//     status = "planned",
//     plannerInput,
//   } = params

//   return supabaseAdmin
//     .from("trips")
//     .insert({
//       user_id: userId,
//       title,
//       start_location_text: startLocation,
//       destination_text: destination,
//       start_lat: startLat ?? null,
//       start_lng: startLng ?? null,
//       destination_lat: destLat ?? null,
//       destination_lng: destLng ?? null,
//       trip_duration_days: tripDurationDays,
//       travel_pace: travelPace ?? "moderate",
//       rig_type: rigType ?? null,
//       rig_length_m: rigLengthM ?? null,
//       pet_friendly_required: petFriendlyRequired ?? false,
//       stay_preference: stayPreference ?? null,
//       avoid_gravel_roads: avoidGravelRoads ?? false,
//       budget_preference: budgetPreference ?? null,
//       notes: notes ?? null,
//       end_date: endDate ?? null,
//       status,
//       planner_input_json: plannerInput,
//       route_data_json: {},
//     })
//     .select()
//     .single()
// }

// // Haversine formula to calculate distance between two coordinates
// function calculateDistance(
//   lat1: number,
//   lng1: number,
//   lat2: number,
//   lng2: number
// ): number {
//   const R = 6371 // Earth's radius in km
//   const dLat = ((lat2 - lat1) * Math.PI) / 180
//   const dLng = ((lng2 - lng1) * Math.PI) / 180
//   const a =
//     Math.sin(dLat / 2) * Math.sin(dLat / 2) +
//     Math.cos((lat1 * Math.PI) / 180) *
//       Math.cos((lat2 * Math.PI) / 180) *
//       Math.sin(dLng / 2) *
//       Math.sin(dLng / 2)
//   const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
//   return R * c
// }

// function isWithinAustralia(lat: number, lng: number): boolean {
//   // Broad mainland + Tasmania bounding box.
//   return lat >= -44.5 && lat <= -9 && lng >= 112 && lng <= 154
// }

// function extractCountryCode(components: Array<{ short_name?: string; types?: string[] }>): string | null {
//   const country = components.find((component) => component.types?.includes("country"))
//   return country?.short_name ?? null
// }

// async function geocodeWithAustraliaBias(address: string): Promise<{ lat: number; lng: number; formattedAddress?: string } | null> {
//   const apiKey = process.env.NEXT_PUBLIC_GMAPS_API_KEY
//   if (!apiKey) return null

//   const base = "https://maps.googleapis.com/maps/api/geocode/json"
//   const url = `${base}?address=${encodeURIComponent(address)}&components=country:AU&region=au&key=${apiKey}`

//   try {
//     const response = await fetch(url)
//     const data = await response.json()
//     const results = Array.isArray(data?.results) ? data.results : []
//     if (results.length === 0) return null

//     const australianResult = results.find((result: { address_components?: Array<{ short_name?: string; types?: string[] }>; geometry?: { location?: { lat?: number; lng?: number } }; formatted_address?: string }) => {
//       const country = extractCountryCode(result.address_components || [])
//       return country === "AU"
//     }) || results[0]

//     const lat = Number(australianResult?.geometry?.location?.lat)
//     const lng = Number(australianResult?.geometry?.location?.lng)
//     if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

//     return {
//       lat,
//       lng,
//       formattedAddress: australianResult.formatted_address,
//     }
//   } catch {
//     return null
//   }
// }

// function pickSpacedStops<T extends { distance_from_start_km: number }>(
//   sortedStops: T[],
//   minSpacingKm: number,
//   maxCount: number
// ): T[] {
//   const picked: T[] = []

//   for (const stop of sortedStops) {
//     if (picked.length >= maxCount) break

//     const isFarEnough = picked.every(
//       (existing) =>
//         Math.abs(existing.distance_from_start_km - stop.distance_from_start_km) >= minSpacingKm
//     )

//     if (isFarEnough) picked.push(stop)
//   }

//   // Fallback: if strict spacing rejects too many, fill remaining slots by order.
//   if (picked.length < Math.min(maxCount, sortedStops.length)) {
//     for (const stop of sortedStops) {
//       if (picked.length >= maxCount) break
//       if (!picked.some((p) => p.distance_from_start_km === stop.distance_from_start_km)) {
//         picked.push(stop)
//       }
//     }
//   }

//   return picked
// }

// function normalizeName(value: string): string {
//   return value.trim().toLowerCase().replace(/\s+/g, " ")
// }

// function buildCustomStopKey(locationName: string, latitude: string, longitude: string): string {
//   const latNum = Number(latitude)
//   const lngNum = Number(longitude)
//   if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
//     return `${normalizeName(locationName)}|${latNum.toFixed(5)}|${lngNum.toFixed(5)}`
//   }
//   return `${normalizeName(locationName)}|${latitude}|${longitude}`
// }

// // Generate stops from database with filtering
// async function generateStop(
//   startLat: number,
//   startLng: number,
//   destLat: number,
//   destLng: number
// ): Promise<GenerateStopResult> {
//   if (!supabaseAdmin) {
//     return {
//       success: false,
//       stops: [],
//       error: "Database not configured",
//     }
//   }

//   try {
//     // Calculate bounding box: ±1 degree from start/dest
//     const minLat = Math.min(startLat, destLat) - 1
//     const maxLat = Math.max(startLat, destLat) + 1
//     const minLng = Math.min(startLng, destLng) - 1
//     const maxLng = Math.max(startLng, destLng) + 1

//     // Query stops table with bounding box
//     const { data: allStops, error: queryError } = await supabaseAdmin
//       .from("stops")
//       .select("*")
//       .gte("latitude", minLat)
//       .lte("latitude", maxLat)
//       .gte("longitude", minLng)
//       .lte("longitude", maxLng)

//     if (queryError) {
//       return {
//         success: false,
//         stops: [],
//         error: queryError.message,
//       }
//     }

//     if (!allStops || allStops.length === 0) {
//       console.log("[2/4] generateStop diagnostics", {
//         totalCandidates: 0,
//         afterProximity: 0,
//         afterCorridor: 0,
//       })

//       return {
//         success: true,
//         stops: [],
//         totalCandidates: 0,
//         afterProximity: 0,
//         afterCorridor: 0,
//       }
//     }

//     // Calculate direct distance between start and destination
//     const directDistance = calculateDistance(startLat, startLng, destLat, destLng)

//     // Calculate the true lateral (perpendicular) distance from a stop to the A→B line.
//     // This is far more reliable than min(distFromStart, distFromDest) or sumDist ellipses,
//     // which either miss on-route stops or allow far-off-route ones through.
//     // Returns { lateralKm, tRaw } for a point relative to the A→B route line.
//     // tRaw < 0 means the stop is "behind" the start; tRaw > 1 means past the destination.
//     const routeProjection = (lat: number, lng: number): { lateralKm: number; tRaw: number } => {
//       if (directDistance <= 0) {
//         return { lateralKm: calculateDistance(startLat, startLng, lat, lng), tRaw: 0 }
//       }
//       const avgLatRad = ((startLat + destLat) / 2) * Math.PI / 180
//       const scaleX = Math.cos(avgLatRad)
//       const vx = (destLng - startLng) * scaleX
//       const vy = destLat - startLat
//       const wx = (lng - startLng) * scaleX
//       const wy = lat - startLat
//       const vLenSq = vx * vx + vy * vy
//       const tRaw = vLenSq > 1e-12 ? (wx * vx + wy * vy) / vLenSq : 0
//       const tClamped = Math.max(0, Math.min(1, tRaw))
//       const projLat = startLat + tClamped * (destLat - startLat)
//       const projLng = startLng + tClamped * (destLng - startLng)
//       return { lateralKm: calculateDistance(lat, lng, projLat, projLng), tRaw }
//     }

//     // Filter and enrich stops with distance calculations
//     const enrichedStops = allStops
//       .map((stop) => {
//         const distFromStart = calculateDistance(startLat, startLng, stop.latitude, stop.longitude)
//         const distFromDest = calculateDistance(stop.latitude, stop.longitude, destLat, destLng)
//         const { lateralKm, tRaw } = routeProjection(stop.latitude, stop.longitude)
//         // Reject stops behind the start or past the destination (5% tolerance)
//         const isForwardOnRoute = tRaw >= -0.05 && tRaw <= 1.05

//         return {
//           ...stop,
//           distance_from_start_km: Math.round(distFromStart * 10) / 10,
//           distance_to_dest_km: Math.round(distFromDest * 10) / 10,
//           distance_to_route_km: Math.round(lateralKm * 10) / 10,
//           is_between_start_and_dest: lateralKm <= 150 && isForwardOnRoute,
//         }
//       })

//     // Filter: lateral proximity ≤150 km AND forward on route (not behind start or past dest).
//     const afterProximity = enrichedStops.filter((stop) => stop.is_between_start_and_dest)
//     const rejectedByProximity = enrichedStops.filter((stop) => !stop.is_between_start_and_dest)

//     // No separate corridor filter needed — lateral distance already handles it.
//     const afterCorridor = afterProximity
//     const rejectedByCorridor: typeof afterProximity = []

//     const orderedStops = afterCorridor
//       // Sort by distance from start
//       .sort((a, b) => a.distance_from_start_km - b.distance_from_start_km)

//     const targetPlannedStops = Math.max(2, Math.min(8, Math.round(directDistance / 220)))
//     const minSpacingKm = Math.max(60, Math.round(directDistance / (targetPlannedStops + 1) * 0.5))
//     const filteredStops = pickSpacedStops(orderedStops, minSpacingKm, targetPlannedStops)

//     console.log("[2/4] generateStop diagnostics", {
//       totalCandidates: allStops.length,
//       rejectedByProximity: rejectedByProximity.length,
//       afterProximity: afterProximity.length,
//       rejectedByCorridor: rejectedByCorridor.length,
//       afterCorridor: afterCorridor.length,
//       plannedStops: filteredStops.length,
//       targetPlannedStops,
//       minSpacingKm,
//     })

//     if (rejectedByProximity.length > 0) {
//       console.log("[2/4] rejected by proximity (>100km)", {
//         count: rejectedByProximity.length,
//         sample: rejectedByProximity.slice(0, 3).map((s) => ({
//           id: s.id,
//           name: s.location_name,
//           distance_to_route_km: s.distance_to_route_km,
//         })),
//       })
//     }

//     if (rejectedByCorridor.length > 0) {
//       console.log("[2/4] rejected by corridor", {
//         count: rejectedByCorridor.length,
//         sample: rejectedByCorridor.slice(0, 3).map((s) => ({
//           id: s.id,
//           name: s.location_name,
//           distance_from_start_km: s.distance_from_start_km,
//           distance_to_dest_km: s.distance_to_dest_km,
//         })),
//       })
//     }

//     return {
//       success: true,
//       stops: filteredStops,
//       totalCandidates: allStops.length,
//       afterProximity: afterProximity.length,
//       afterCorridor: afterCorridor.length,
//     }
//   } catch (error) {
//     return {
//       success: false,
//       stops: [],
//       error: error instanceof Error ? error.message : "Unknown error",
//     }
//   }
// }

// // Generate custom stops from Google Places
// async function generateCustomStop(
//   startLat: number,
//   startLng: number,
//   destLat: number,
//   destLng: number,
//   tripId: string,
//   tripDurationDays: number,
//   existingStopDistancesKm: number[] = [],
//   requestedCustomStops = 0
// ): Promise<GenerateCustomStopResult> {
//   if (!supabaseAdmin) {
//     return {
//       success: false,
//       stopsGenerated: 0,
//       error: "Database not configured",
//     }
//   }

//   try {
//     const safeTripDays = Math.max(1, Math.round(Number(tripDurationDays) || 1))
//     if (safeTripDays <= 1) {
//       console.log("[3/4] Skipping auto custom stop generation for one-day trip")
//       return {
//         success: true,
//         stopsGenerated: 0,
//         totalFetched: 0,
//         afterDedup: 0,
//       }
//     }

//     const apiKey = process.env.NEXT_PUBLIC_GMAPS_API_KEY
//     if (!apiKey) {
//       return {
//         success: false,
//         stopsGenerated: 0,
//         error: "Google Maps API key not configured",
//       }
//     }

//     const directDistanceKmForProbes = calculateDistance(startLat, startLng, destLat, destLng)

//     // Fetch the actual road polyline so probe points land on the highway, not in the ocean.
//     let routePolyline: Array<{ lat: number; lng: number }> | null = null
//     let routeCumTable: number[] | null = null
//     try {
//       const dirParams = new URLSearchParams({
//         origin: `${startLat},${startLng}`,
//         destination: `${destLat},${destLng}`,
//         mode: "driving",
//         key: apiKey,
//       })
//       const dirRes = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${dirParams}`)
//       const dirData = await dirRes.json()
//       if (dirData.status === "OK" && dirData.routes?.length) {
//         const encoded = dirData.routes[0]?.overview_polyline?.points
//         if (encoded) {
//           routePolyline = decodePolyline(encoded)
//           routeCumTable = buildCumulativeDistanceTable(routePolyline)
//         }
//       }
//     } catch {
//       // Straight-line fallback used below
//     }

//     // More probe points for longer routes. Minimum is 2× tripDays so each day segment has at
//     // least two probe points, giving enough coverage for stops in sparse outback corridors.
//     const baseProbeCount = Math.max(safeTripDays * 2, Math.ceil(directDistanceKmForProbes / 100))
//     const probeCount = directDistanceKmForProbes > env.PROBE_DISTANCE_THRESHOLD ? Math.min(50, baseProbeCount) : Math.min(30, baseProbeCount)
//     const totalRouteKm = routeCumTable ? routeCumTable[routeCumTable.length - 1] : directDistanceKmForProbes
//     const probePoints = Array.from({ length: probeCount }, (_, i) => {
//       const fraction = (i + 1) / (probeCount + 1)
//       if (routePolyline && routeCumTable) {
//         return samplePolylineAtKm(fraction * totalRouteKm, routePolyline, routeCumTable)
//       }
//       return {
//         lat: startLat + (destLat - startLat) * fraction,
//         lng: startLng + (destLng - startLng) * fraction,
//       }
//     })

//     // Irrelevant name patterns to exclude from overnight stop options.
//     // Fuel/service stations are excluded by name even when returned under campground searches
//     // (e.g. "BP Bamaga Roadhouse", "Injinoo Fuel Station", "Seisia Service Station").
//     // Roadhouse is NOT excluded — outback roadhouses often have genuine camping.
//     const OVERNIGHT_EXCLUDE = /hotel|motel|hostel|backpacker|resort|inn\b|b&b|bed and breakfast|airbnb|toilet|toilets|amenities|amenity block|public toilet|car park|parking area|day use area|service station|fuel station|petrol station|\bservo\b|\bgas station\b/i

//     // 30 km radius keeps probes on the highway corridor. Polyline-based probe points
//     // are already on the road, so a tight radius is sufficient and avoids pulling in
//     // off-route locations (e.g. island resorts, offshore campgrounds).
//     const searchRadius = env.PROBE_SEARCH_RADIUS

//     // Australian caravan / camping focused search types.
//     // rv_park = Google's type for caravan parks, holiday parks, tourist parks.
//     // campground = national park camps, free camps, bush camps, showgrounds.
//     const overnightSearches: Array<{ type: string; keyword?: string; radius: number }> = [
//       { type: "rv_park", radius: searchRadius },
//       { type: "campground", radius: searchRadius },
//       { type: "rv_park", keyword: "caravan park", radius: searchRadius },
//       { type: "rv_park", keyword: "holiday park", radius: searchRadius },
//       { type: "rv_park", keyword: "tourist park", radius: searchRadius },
//       { type: "rv_park", keyword: "van park", radius: searchRadius },
//       { type: "campground", keyword: "free camp", radius: searchRadius },
//       { type: "campground", keyword: "bush camp", radius: searchRadius },
//       { type: "campground", keyword: "showground", radius: searchRadius },
//       { type: "campground", keyword: "roadhouse", radius: searchRadius },
//       { type: "campground", keyword: "station stay", radius: searchRadius },
//       { type: "campground", keyword: "national park", radius: searchRadius },
//       { type: "gas_station", keyword: "truck stop", radius: searchRadius },
//     ]

//     if (directDistanceKmForProbes > 300) {
//       overnightSearches.push(
//         { type: "campground", keyword: "council campsite", radius: searchRadius },
//         { type: "campground", keyword: "lakeside", radius: searchRadius },
//         { type: "campground", keyword: "riverside", radius: searchRadius },
//       )
//     }

//     const seenPlaces = new Set<string>()
//     const customStopCandidates: Array<Record<string, unknown> & { distance_from_start_km: number }> = []
//     let totalFetched = 0

//     // Search at each probe point for overnight stops (caravan parks, campgrounds)
//     for (const point of probePoints) {
//       for (const search of overnightSearches) {
//         try {
//           const params = new URLSearchParams({
//             location: `${point.lat},${point.lng}`,
//             radius: String(search.radius),
//             type: search.type,
//             key: apiKey,
//           })
//           if (search.keyword) params.set("keyword", search.keyword)

//           const response = await fetch(
//             `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`
//           )

//           const data = await response.json()
//           if (data.results) {
//             totalFetched += data.results.length
//             const maxResultsPerSearch = directDistanceKmForProbes > 300 ? 20 : 10
//             data.results.slice(0, maxResultsPerSearch).forEach((place: Record<string, unknown>) => {
//               const name = String(place.name ?? "")
//               // Skip irrelevant accommodation types (hotels, motels, etc.)
//               if (OVERNIGHT_EXCLUDE.test(name)) return

//               const geometry = place.geometry as {
//                 location?: { lat?: number; lng?: number }
//               } | null
//               const lat = Number(geometry?.location?.lat ?? 0)
//               const lng = Number(geometry?.location?.lng ?? 0)
//               if (!lat || !lng) return

//               const key = `${name.toLowerCase().trim()}|${lat.toFixed(4)}|${lng.toFixed(4)}`
//               if (!seenPlaces.has(key)) {
//                 seenPlaces.add(key)
//                 const distanceFromStart = calculateDistance(startLat, startLng, lat, lng)

//                 // Reject results too far off the actual road corridor.
//                 // Use polyline projection when available (accurate for coastal/curved routes).
//                 // 25 km threshold prevents offshore islands (e.g. Whitsunday Island is ~31 km
//                 // from the Bruce Highway) while allowing normal highway-adjacent stops.
//                 let lateralKm: number
//                 let tRaw: number
//                 if (routePolyline && routeCumTable) {
//                   const { distanceFromStartKm: dfs, lateralKm: lkm } = projectPointOntoPolyline(lat, lng, routePolyline, routeCumTable)
//                   lateralKm = lkm
//                   const totalKm = routeCumTable[routeCumTable.length - 1]
//                   tRaw = totalKm > 0 ? dfs / totalKm : 0
//                 } else {
//                   const avgLatRad = ((startLat + destLat) / 2) * Math.PI / 180
//                   const scaleX = Math.cos(avgLatRad)
//                   const vx = (destLng - startLng) * scaleX
//                   const vy = destLat - startLat
//                   const wx = (lng - startLng) * scaleX
//                   const wy = lat - startLat
//                   const vLenSq = vx * vx + vy * vy
//                   tRaw = vLenSq > 1e-12 ? (wx * vx + wy * vy) / vLenSq : 0
//                   const tClamped = Math.max(0, Math.min(1, tRaw))
//                   const projLat = startLat + tClamped * (destLat - startLat)
//                   const projLng = startLng + tClamped * (destLng - startLng)
//                   lateralKm = calculateDistance(lat, lng, projLat, projLng)
//                 }
//                 if (tRaw < -0.05 || tRaw > 1.05) return
//                 if (lateralKm > 25) return

//                 customStopCandidates.push({
//                   trip_id: tripId,
//                   location_name: name,
//                   latitude: String(lat),
//                   longitude: String(lng),
//                   place_type: "campground",
//                   distance_from_start_km: Math.round(distanceFromStart * 10) / 10,
//                 })
//               }
//             })
//           }
//         } catch (error) {
//           console.warn(`Failed to search ${search.type} at probe point:`, error)
//         }
//       }
//     }

//     const directDistanceKm = directDistanceKmForProbes
//     // Use the explicit requestedCustomStops passed from trip handler, with fallback to distance-based calc
//     const targetCustomStops = requestedCustomStops > 0
//       ? requestedCustomStops
//       : Math.max(2, Math.min(10, Math.round(directDistanceKm / 180)))

//     const orderedCustomCandidates = [...customStopCandidates].sort(
//       (a, b) => a.distance_from_start_km - b.distance_from_start_km
//     )
//     // Dynamic initial spacing based on route length and target
//     const initialSpacingKm = Math.max(20, Math.ceil(directDistanceKm / (targetCustomStops + Math.ceil(targetCustomStops * 0.2))))
//     const plannedCustomCandidates = pickSpacedStops(orderedCustomCandidates, initialSpacingKm, targetCustomStops)

//     // If initial spacing doesn't hit quota, progressively relax constraints
//     if (plannedCustomCandidates.length < targetCustomStops && customStopCandidates.length > plannedCustomCandidates.length) {
//       const selectedKeys = new Set(
//         plannedCustomCandidates.map((s) =>
//           buildCustomStopKey(String(s.location_name || ""), String(s.latitude || ""), String(s.longitude || ""))
//         )
//       )

//       const addMoreCandidates = (candidates: typeof customStopCandidates, minSpacingKm: number) => {
//         for (const candidate of candidates) {
//           if (plannedCustomCandidates.length >= targetCustomStops) break
//           const key = buildCustomStopKey(String(candidate.location_name || ""), String(candidate.latitude || ""), String(candidate.longitude || ""))
//           if (selectedKeys.has(key)) continue
//           const farEnough = plannedCustomCandidates.every((p) => Math.abs(p.distance_from_start_km - candidate.distance_from_start_km) >= minSpacingKm)
//           if (!farEnough) continue
//           plannedCustomCandidates.push(candidate)
//           selectedKeys.add(key)
//         }
//       }

//       // Pass 1: Relaxed spacing (60% of initial), still using no-overlap candidates
//       const pass1Spacing = Math.max(10, Math.ceil(initialSpacingKm * 0.6))
//       addMoreCandidates(customStopCandidates.filter((c) => existingStopDistancesKm.every((d) => Math.abs(c.distance_from_start_km - d) >= 60)), pass1Spacing)

//       // Pass 2: Even more relaxed (40% initial), reduce DB overlap to 25km
//       if (plannedCustomCandidates.length < targetCustomStops) {
//         const pass2Spacing = Math.max(8, Math.ceil(initialSpacingKm * 0.4))
//         addMoreCandidates(customStopCandidates.filter((c) => existingStopDistancesKm.every((d) => Math.abs(c.distance_from_start_km - d) >= 25)), pass2Spacing)
//       }

//       // Pass 3: Tight spacing (25% initial), minimal DB overlap (15km)
//       if (plannedCustomCandidates.length < targetCustomStops) {
//         const pass3Spacing = Math.max(5, Math.ceil(initialSpacingKm * 0.25))
//         addMoreCandidates(customStopCandidates.filter((c) => existingStopDistancesKm.every((d) => Math.abs(c.distance_from_start_km - d) >= 15)), pass3Spacing)
//       }

//       // Pass 4: Final fallback with very loose spacing (3km)
//       if (plannedCustomCandidates.length < targetCustomStops) {
//         addMoreCandidates(customStopCandidates, 3)
//       }

//       if (plannedCustomCandidates.length >= targetCustomStops) {
//         console.log(`[3/4] Adaptive fallback filled to ${plannedCustomCandidates.length} stops (target: ${targetCustomStops})`)
//       } else {
//         console.log(`[3/4] Adaptive fallback partially filled: ${plannedCustomCandidates.length} of ${targetCustomStops} (initial spacing: ${initialSpacingKm}km)`)
//       }
//     }
//     // Sort candidates by distance from start so we assign day indices sequentially
//     // along the route rather than by raw progress fraction (which clusters at extremes).
//     const sortedForDayAssign = [...plannedCustomCandidates].sort(
//       (a, b) => a.distance_from_start_km - b.distance_from_start_km
//     )

//     // Divide the full route into equal-km buckets — one per trip day.
//     // Each stop is assigned to the bucket its distance falls into.
//     // If a day bucket ends up empty, the nearest stop from an adjacent bucket
//     // is borrowed to fill it, preventing phantom empty days.
//     const totalKmForDays = directDistanceKm > 0 ? directDistanceKm : 1
//     const kmPerDay = totalKmForDays / safeTripDays

//     // First pass: assign by km bucket
//     const dayBuckets: number[] = sortedForDayAssign.map((candidate) => {
//       const distKm = Number(candidate.distance_from_start_km)
//       return Math.min(safeTripDays - 1, Math.floor(distKm / kmPerDay))
//     })

//     // Second pass: identify empty days and fill from adjacent stops
//     const bucketCounts = Array.from({ length: safeTripDays }, () => 0)
//     dayBuckets.forEach((d) => { bucketCounts[d] = (bucketCounts[d] || 0) + 1 })

//     const filledBuckets = [...dayBuckets]
//     for (let day = 0; day < safeTripDays; day++) {
//       if (bucketCounts[day] > 0) continue
//       // Find the nearest stop by km distance to the center of this empty day
//       const dayCenterKm = (day + 0.5) * kmPerDay
//       let bestIdx = -1
//       let bestDelta = Infinity
//       sortedForDayAssign.forEach((candidate, idx) => {
//         const delta = Math.abs(Number(candidate.distance_from_start_km) - dayCenterKm)
//         if (delta < bestDelta) { bestDelta = delta; bestIdx = idx }
//       })
//       if (bestIdx >= 0) {
//         filledBuckets[bestIdx] = day
//         bucketCounts[day] = 1
//       }
//     }

//     const customStopsToInsert = sortedForDayAssign.map((candidate, idx) => ({
//       trip_id: candidate.trip_id,
//       location_name: candidate.location_name,
//       latitude: candidate.latitude,
//       longitude: candidate.longitude,
//       place_type: candidate.place_type,
//       day_index: filledBuckets[idx],
//     }))

//     // Deduplicate generated custom stops before touching DB.
//     const uniqueCustomStops = [] as typeof customStopsToInsert
//     const seenKeys = new Set<string>()
//     for (const stop of customStopsToInsert) {
//       const key = buildCustomStopKey(stop.location_name as string, stop.latitude as string, stop.longitude as string)
//       if (seenKeys.has(key)) continue
//       seenKeys.add(key)
//       uniqueCustomStops.push(stop)
//     }

//     let insertedCustomStopsCount = 0

//     // Save planned custom stops to custom_stops table
//     if (uniqueCustomStops.length > 0) {
//       const { data: existingCustomStops, error: existingError } = await supabaseAdmin
//         .from("custom_stops")
//         .select("location_name, latitude, longitude")
//         .eq("trip_id", tripId)

//       if (existingError) {
//         return {
//           success: false,
//           stopsGenerated: 0,
//           totalFetched,
//           afterDedup: customStopCandidates.length,
//           error: existingError.message,
//         }
//       }

//       const existingKeys = new Set(
//         (existingCustomStops || []).map((stop) =>
//           buildCustomStopKey(stop.location_name, stop.latitude, stop.longitude)
//         )
//       )

//       const finalCustomStopsToInsert = uniqueCustomStops.filter((stop) => {
//         const key = buildCustomStopKey(stop.location_name as string, stop.latitude as string, stop.longitude as string)
//         return !existingKeys.has(key)
//       })

//       if (finalCustomStopsToInsert.length > 0) {
//         const { error: insertError } = await supabaseAdmin
//           .from("custom_stops")
//           .insert(finalCustomStopsToInsert)

//         if (insertError) {
//           console.log("[3/4] generateCustomStop diagnostics", {
//             totalFetched,
//             afterDedup: customStopCandidates.length,
//             planned: finalCustomStopsToInsert.length,
//             inserted: 0,
//           })

//           return {
//             success: false,
//             stopsGenerated: 0,
//             totalFetched,
//             afterDedup: customStopCandidates.length,
//             error: insertError.message,
//           }
//         }

//         insertedCustomStopsCount = finalCustomStopsToInsert.length
//       }

//       console.log("[3/4] custom stop dedupe", {
//         generated: customStopsToInsert.length,
//         uniqueGenerated: uniqueCustomStops.length,
//         existingInDb: (existingCustomStops || []).length,
//         insertedNew: insertedCustomStopsCount,
//         targetCustomStops,
//         tripDurationDays: safeTripDays,
//       })
//     }

//     console.log("[3/4] generateCustomStop diagnostics", {
//       totalFetched,
//       afterDedup: customStopCandidates.length,
//       planned: uniqueCustomStops.length,
//       inserted: insertedCustomStopsCount,
//       targetCustomStops,
//       directDistanceKm: Math.round(directDistanceKm),
//     })

//     return {
//       success: true,
//       stopsGenerated: insertedCustomStopsCount,
//       totalFetched,
//       afterDedup: customStopCandidates.length,
//     }
//   } catch (error) {
//     return {
//       success: false,
//       stopsGenerated: 0,
//       error: error instanceof Error ? error.message : "Unknown error",
//     }
//   }
// }

// interface TripGenerationJob {
//   tripId: string
//   title: string
//   startLat: number
//   startLng: number
//   destLat: number
//   destLng: number
//   tripDurationDays: number
// }

// const tripGenerationQueue: TripGenerationJob[] = []
// let isTripQueueProcessing = false

// async function processTripGenerationJob(job: TripGenerationJob): Promise<void> {
//   if (!supabaseAdmin) {
//     throw new Error("Database not configured")
//   }

//   let generatedStopsCount = 0
//   let customStopsCount = 0

//   await supabaseAdmin
//     .from("trips")
//     .update({ status: "in_progress" })
//     .eq("id", job.tripId)

//   console.log("[queue] ▶️ Starting trip generation job", {
//     tripId: job.tripId,
//     title: job.title,
//   })

//   // ============================================================
//   // [2/4] GENERATE STOPS FROM DATABASE
//   // ============================================================
//   console.log("[2/4] 🔍 Generating stops from DB...", {
//     startCoords: [job.startLat, job.startLng],
//     destCoords: [job.destLat, job.destLng],
//     tripId: job.tripId,
//   })

//   const { success: generateSuccess, stops = [], error: generateError } = await generateStop(
//     job.startLat,
//     job.startLng,
//     job.destLat,
//     job.destLng
//   )

//   if (generateError) {
//     console.warn("[2/4] ⚠️ Stop generation warning:", generateError)
//   }

//   if (generateSuccess && stops.length > 0) {
//     console.log(`[2/4] 📍 Found ${stops.length} filtered stops from DB`)

//     const candidateRows = stops.map((stop, index) => {
//       const stopData = stop as {
//         id: string
//         distance_to_route_km: number
//         distance_from_start_km: number
//         distance_to_dest_km: number
//         is_between_start_and_dest: boolean
//       }

//       return {
//         trip_id: job.tripId,
//         stop_id: stopData.id,
//         rank_score: index + 1,
//         distance_to_route_km: stopData.distance_to_route_km,
//         detour_minutes: null,
//         suitability_json: {
//           distance_from_start: stopData.distance_from_start_km,
//           distance_to_dest: stopData.distance_to_dest_km,
//           is_between: stopData.is_between_start_and_dest,
//         },
//         generation_version: 1,
//       }
//     })

//     const uniqueCandidateRows = Array.from(
//       new Map(candidateRows.map((row) => [row.stop_id, row])).values()
//     )

//     const { error: insertError } = await supabaseAdmin
//       .from("trip_candidate_stops")
//       .upsert(uniqueCandidateRows, {
//         onConflict: "trip_id,stop_id,generation_version",
//       })

//     if (insertError) {
//       console.error("[2/4] ❌ Failed to save candidate stops:", insertError)
//     } else {
//       generatedStopsCount = uniqueCandidateRows.length
//       console.log(`[2/4] ✅ Saved ${generatedStopsCount} stops to trip_candidate_stops table`)
//     }
//   } else {
//     console.log("[2/4] ⓘ No stops found or generation failed")
//   }

//   // ============================================================
//   // [3/4] GENERATE CUSTOM STOPS FROM GOOGLE PLACES
//   // ============================================================
//   console.log("[3/4] 🌐 Generating custom stops from Google Places...", {
//     searchTypes: ["rv_park", "campground", "caravan park keyword"],
//   })

//   const dbStopDistancesKm = stops
//     .map((stop) => (stop as { distance_from_start_km?: number }).distance_from_start_km ?? 0)
//     .filter((distance) => distance > 0)

//   const safeTripDays = Math.max(1, Math.round(Number(job.tripDurationDays) || 1))
//   const dayBasedStopTarget = safeTripDays * 3
//   const directDistanceKm = calculateDistance(
//     job.startLat,
//     job.startLng,
//     job.destLat,
//     job.destLng
//   )
//   const estimatedDriveDistanceKm = Math.max(
//     directDistanceKm,
//     Math.min(directDistanceKm * 1.45, directDistanceKm + 600)
//   )
//   const distanceBasedStopCap = Math.max(1, Math.ceil(estimatedDriveDistanceKm / 90))
//   const targetTotalStops = Math.min(dayBasedStopTarget, distanceBasedStopCap)
//   const customStopsNeeded = Math.max(0, targetTotalStops - generatedStopsCount)

//   console.log("[3/4] target stop quota", {
//     tripDurationDays: safeTripDays,
//     dayBasedStopTarget,
//     directDistanceKm: Math.round(directDistanceKm),
//     estimatedDriveDistanceKm: Math.round(estimatedDriveDistanceKm),
//     distanceBasedStopCap,
//     targetTotalStops,
//     dbStops: generatedStopsCount,
//     googleStopsNeeded: customStopsNeeded,
//   })

//   const {
//     success: customSuccess,
//     stopsGenerated = 0,
//     totalFetched = 0,
//     afterDedup = 0,
//     error: customError,
//   } = await generateCustomStop(
//     job.startLat,
//     job.startLng,
//     job.destLat,
//     job.destLng,
//     job.tripId,
//     Number(job.tripDurationDays) || 1,
//     dbStopDistancesKm,
//     customStopsNeeded
//   )

//   if (customError) {
//     console.warn("[3/4] ⚠️ Custom stop generation warning:", customError)
//   }

//   if (customSuccess) {
//     customStopsCount = stopsGenerated
//     console.log(
//       `[3/4] ✅ Generated and saved ${customStopsCount} custom stops to custom_stops table`,
//       {
//         totalFetched,
//         afterDedup,
//       }
//     )
//   } else {
//     console.log("[3/4] ⓘ Custom stop generation skipped or failed", {
//       totalFetched,
//       afterDedup,
//     })
//   }

//   // ============================================================
//   // [4/4] COMPLETE JOB
//   // ============================================================
//   await supabaseAdmin
//     .from("trips")
//     .update({ status: "completed" })
//     .eq("id", job.tripId)

//   console.log("[4/4] ✅ Trip generation completed", {
//     tripId: job.tripId,
//     totalStopsGenerated: generatedStopsCount + customStopsCount,
//   })
// }

// async function processTripGenerationQueue(): Promise<void> {
//   if (isTripQueueProcessing) return
//   isTripQueueProcessing = true

//   while (tripGenerationQueue.length > 0) {
//     const nextJob = tripGenerationQueue.shift()
//     if (!nextJob) continue

//     try {
//       await processTripGenerationJob(nextJob)
//     } catch (error) {
//       console.error("[queue] ❌ Trip generation job failed", {
//         tripId: nextJob.tripId,
//         error: error instanceof Error ? error.message : String(error),
//       })

//       if (supabaseAdmin) {
//         await supabaseAdmin
//           .from("trips")
//           .update({ status: "planned" })
//           .eq("id", nextJob.tripId)
//       }
//     }
//   }

//   isTripQueueProcessing = false
// }

// function enqueueTripGeneration(job: TripGenerationJob): number {
//   tripGenerationQueue.push(job)
//   void processTripGenerationQueue()
//   return tripGenerationQueue.length
// }

// export async function GET(req: NextRequest) {
//   try {
//     if (!supabaseAdmin) {
//       return NextResponse.json(
//         { success: false, error: "Database not configured" },
//         { status: 500 }
//       )
//     }

//     const { searchParams } = new URL(req.url)
//     const userId = searchParams.get("user_id")

//     let query = supabaseAdmin
//       .from("trips")
//       .select("*")
//       .order("created_at", { ascending: false })

//     if (userId) {
//       query = query.eq("user_id", userId)
//     }

//     const { data, error } = await query

//     if (error) {
//       console.error("Database error:", error)
//       return NextResponse.json(
//         { success: false, error: error.message },
//         { status: 500 }
//       )
//     }

//     return NextResponse.json({
//       success: true,
//       trips: data,
//     })
//   } catch (error: unknown) {
//     const message = error instanceof Error ? error.message : "Unknown error"
//     return NextResponse.json(
//       { success: false, error: message },
//       { status: 500 }
//     )
//   }
// }

// export async function POST(req: NextRequest) {
//   try {
//     if (!supabaseAdmin) {
//       return NextResponse.json(
//         { success: false, error: "Database not configured" },
//         { status: 500 }
//       )
//     }

//     const body = await req.json()

//     const {
//       userId,
//       title,
//       startLocation,
//       destination,
//       startLat,
//       startLng,
//       destLat,
//       destLng,
//       tripDurationDays,
//       travelPace,
//       rigType,
//       rigLengthM,
//       petFriendlyRequired,
//       stayPreference,
//       avoidGravelRoads,
//       budgetPreference,
//       notes,
//       endDate,
//       status = "planned",
//     } = body

//     let resolvedStartLat = startLat
//     let resolvedStartLng = startLng
//     let resolvedDestLat = destLat
//     let resolvedDestLng = destLng

//     const hasAllCoords =
//       Number.isFinite(Number(startLat)) &&
//       Number.isFinite(Number(startLng)) &&
//       Number.isFinite(Number(destLat)) &&
//       Number.isFinite(Number(destLng))

//     if (hasAllCoords) {
//       const startInAu = isWithinAustralia(Number(startLat), Number(startLng))
//       const destInAu = isWithinAustralia(Number(destLat), Number(destLng))

//       if (!startInAu || !destInAu) {
//         const [startGeo, destGeo] = await Promise.all([
//           geocodeWithAustraliaBias(startLocation),
//           geocodeWithAustraliaBias(destination),
//         ])

//         if (startGeo && destGeo) {
//           resolvedStartLat = startGeo.lat
//           resolvedStartLng = startGeo.lng
//           resolvedDestLat = destGeo.lat
//           resolvedDestLng = destGeo.lng

//           console.log("[0/4] 🧭 Corrected ambiguous coordinates using AU-biased geocoding", {
//             startLocation,
//             destination,
//             correctedStart: [resolvedStartLat, resolvedStartLng],
//             correctedDestination: [resolvedDestLat, resolvedDestLng],
//           })
//         } else {
//           return NextResponse.json(
//             {
//               success: false,
//               error: "Could not resolve locations to Australia. Please include state/country (for example: Kenilworth QLD, Australia).",
//             },
//             { status: 400 }
//           )
//         }
//       }
//     }

//     if (!userId || !title || !startLocation || !destination || !tripDurationDays) {
//       return NextResponse.json(
//         { success: false, error: "userId, title, start location, destination, and duration are required" },
//         { status: 400 }
//       )
//     }

//     // Ensure user exists in users table (handles DB reset scenario)
//     const { data: existingUser } = await supabaseAdmin
//       .from("users")
//       .select("id, metadata")
//       .eq("id", userId)
//       .single()

//     const incomingDefaults = {
//       travelPace: travelPace ?? null,
//       rigType: rigType ?? null,
//       rigLengthM: rigLengthM ?? null,
//       petFriendlyRequired: petFriendlyRequired ?? false,
//       avoidGravelRoads: avoidGravelRoads ?? false,
//       stayPreference: stayPreference ?? null,
//       budgetPreference: budgetPreference ?? null,
//     }

//     if (!existingUser) {
//       const { error: userError } = await supabaseAdmin
//         .from("users")
//         .insert({
//           id: userId,
//           email: `user-${userId}@trackmate.local`,
//           role: "customer",
//           metadata: {
//             defaults: incomingDefaults,
//           },
//           created_at: new Date().toISOString(),
//         })

//       if (userError) {
//         console.error("Failed to ensure user exists:", userError)
//         return NextResponse.json(
//           { success: false, error: "Failed to create user record: " + userError.message },
//           { status: 500 }
//         )
//       }
//     } else {
//       const metadata = (existingUser.metadata as UserMetadata | null) ?? {}
//       const currentDefaults = metadata.defaults ?? {}
//       const mergedDefaults = {
//         travelPace: currentDefaults.travelPace ?? incomingDefaults.travelPace,
//         rigType: currentDefaults.rigType ?? incomingDefaults.rigType,
//         rigLengthM: currentDefaults.rigLengthM ?? incomingDefaults.rigLengthM,
//         petFriendlyRequired: currentDefaults.petFriendlyRequired ?? incomingDefaults.petFriendlyRequired,
//         avoidGravelRoads: currentDefaults.avoidGravelRoads ?? incomingDefaults.avoidGravelRoads,
//         stayPreference: currentDefaults.stayPreference ?? incomingDefaults.stayPreference,
//         budgetPreference: currentDefaults.budgetPreference ?? incomingDefaults.budgetPreference,
//       }

//       const defaultUpdates: Record<string, unknown> = {}
//       if (JSON.stringify(currentDefaults) !== JSON.stringify(mergedDefaults)) {
//         defaultUpdates.metadata = {
//           ...metadata,
//           defaults: mergedDefaults,
//         }
//       }

//       if (Object.keys(defaultUpdates).length > 0) {
//         defaultUpdates.updated_at = new Date().toISOString()
//         const { error: defaultUpdateError } = await supabaseAdmin
//           .from("users")
//           .update(defaultUpdates)
//           .eq("id", userId)

//         if (defaultUpdateError) {
//           console.error("Failed to initialize user defaults:", defaultUpdateError)
//         }
//       }
//     }

//     // ============================================================
//     // [1/4] INSERT TRIP RECORD TO DB
//     // ============================================================
//     console.log("[1/4] 📝 Creating trip record...", {
//       title,
//       startLocation,
//       destination,
//       userId,
//     })

//     const { data, error } = await createTrip({
//       userId,
//       title,
//       startLocation,
//       destination,
//       startLat: resolvedStartLat,
//       startLng: resolvedStartLng,
//       destLat: resolvedDestLat,
//       destLng: resolvedDestLng,
//       tripDurationDays,
//       travelPace,
//       rigType,
//       rigLengthM,
//       petFriendlyRequired,
//       stayPreference,
//       avoidGravelRoads,
//       budgetPreference,
//       notes,
//       endDate,
//       status,
//       plannerInput: body,
//     })

//     if (error) {
//       console.error("[1/4] ❌ Failed to create trip:", error)
//       return NextResponse.json(
//         { success: false, error: "Failed to create trip: " + error.message },
//         { status: 500 }
//       )
//     }

//     console.log(`[1/4] ✅ Trip created successfully`, {
//       tripId: data?.id,
//       title: data?.title,
//     })

//     if (!data?.id) {
//       return NextResponse.json(
//         { success: false, error: "Failed to create trip id" },
//         { status: 500 }
//       )
//     }

//     const hasResolvedCoords =
//       Number.isFinite(Number(resolvedStartLat)) &&
//       Number.isFinite(Number(resolvedStartLng)) &&
//       Number.isFinite(Number(resolvedDestLat)) &&
//       Number.isFinite(Number(resolvedDestLng))

//     if (!hasResolvedCoords) {
//       return NextResponse.json(
//         { success: false, error: "Trip created but missing valid coordinates for planning" },
//         { status: 400 }
//       )
//     }

//     await supabaseAdmin
//       .from("trips")
//       .update({ status: "in_progress" })
//       .eq("id", data.id)

//     const queueSizeAfterEnqueue = enqueueTripGeneration({
//       tripId: data.id,
//       title: data.title,
//       startLat: Number(resolvedStartLat),
//       startLng: Number(resolvedStartLng),
//       destLat: Number(resolvedDestLat),
//       destLng: Number(resolvedDestLng),
//       tripDurationDays: Number(tripDurationDays) || 1,
//     })

//     console.log("[queue] 📨 Trip queued for planning", {
//       tripId: data.id,
//       queueSizeAfterEnqueue,
//     })

//     return NextResponse.json(
//       {
//         success: true,
//         message: `Trip "${title}" queued for planning`,
//         tripId: data.id,
//         status: "in_progress",
//         queueSize: queueSizeAfterEnqueue,
//       },
//       { status: 202 }
//     )
//   } catch (error: unknown) {
//     const message = error instanceof Error ? error.message : "Unknown error"
//     return NextResponse.json(
//       { success: false, error: message },
//       { status: 500 }
//     )
//   }
// }

import { supabaseAdmin } from "@/config/supabase"
import { NextRequest, NextResponse } from "next/server"
import { decodePolyline, buildCumulativeDistanceTable, samplePolylineAtKm, projectPointOntoPolyline } from "@/lib/routePolyline"
import { env } from "@/config/env.config"
import OpenAI from "openai"

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
  routeDistanceKm?: number
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

async function getDrivingDistanceKm(
  startLat: number,
  startLng: number,
  destLat: number,
  destLng: number
): Promise<number | null> {
  const apiKey = process.env.NEXT_PUBLIC_GMAPS_API_KEY
  if (!apiKey) return null

  try {
    const params = new URLSearchParams({
      origin: `${startLat},${startLng}`,
      destination: `${destLat},${destLng}`,
      mode: "driving",
      key: apiKey,
    })
    const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`)
    const data = await response.json()
    const route = data.status === "OK" && Array.isArray(data.routes) ? data.routes[0] : null
    const distanceMeters = route?.legs?.reduce(
      (sum: number, leg: { distance?: { value?: number } }) => sum + (leg.distance?.value ?? 0),
      0
    )

    return distanceMeters > 0 ? distanceMeters / 1000 : null
  } catch (error) {
    console.warn("[queue] Failed to fetch Google driving distance:", error)
    return null
  }
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
  destLng: number,
  travelPace: string = "moderate"
): Promise<GenerateStopResult> {

  console.log("[0/3] generateStop called", { startLat, startLng, destLat, destLng });

  if (!supabaseAdmin) {
    return { success: false, stops: [], error: "Database not configured" };
  }

  try {
    // ============================================================
    // 🔧 CONSTANTS - Using new stricter thresholds
    // Ideal: 5-10km, Acceptable: 20km, Max: 30km (normal), 50km (remote)
    // ============================================================
    const BOUNDING_BUFFER = 1;
    const ROUTE_TOLERANCE = 0.05;
    
    // Determine if route is "remote" (going north, long distance)
    const directDistance = calculateDistance(startLat, startLng, destLat, destLng);
    const isLongTrip = directDistance > 500;
    const isNorthbound = destLat > startLat;
    const isRemote = isLongTrip && isNorthbound;
    
    // New thresholds
    const MAX_LATERAL_KM_VERIFIED = isRemote ? 50 : 30;
    const MAX_LATERAL_KM_GOOGLE = isRemote ? 30 : 20;
    
    console.log("[0/3] Distance thresholds", { 
      directDistance: Math.round(directDistance), 
      isRemote, 
      maxVerifiedKm: MAX_LATERAL_KM_VERIFIED,
      maxGoogleKm: MAX_LATERAL_KM_GOOGLE
    });

    // ============================================================
    // 📏 BASIC CALCULATIONS
    // ============================================================
    const minLat = Math.min(startLat, destLat) - BOUNDING_BUFFER;
    const maxLat = Math.max(startLat, destLat) + BOUNDING_BUFFER;
    const minLng = Math.min(startLng, destLng) - BOUNDING_BUFFER;
    const maxLng = Math.max(startLng, destLng) + BOUNDING_BUFFER;

    console.log("[1/3] Bounding box", { minLat, maxLat, minLng, maxLng });

    // ============================================================
    // 🧠 ROUTE PROJECTION
    // ============================================================
    const routeProjection = (lat: number, lng: number) => {
      if (directDistance <= 0) {
        return {
          lateralKm: calculateDistance(startLat, startLng, lat, lng),
          tRaw: 0,
        };
      }

      const avgLatRad = ((startLat + destLat) / 2) * Math.PI / 180;
      const scaleX = Math.cos(avgLatRad);

      const vx = (destLng - startLng) * scaleX;
      const vy = destLat - startLat;

      const wx = (lng - startLng) * scaleX;
      const wy = lat - startLat;

      const vLenSq = vx * vx + vy * vy;

      const tRaw = vLenSq > 1e-12 ? (wx * vx + wy * vy) / vLenSq : 0;

      const tClamped = Math.max(0, Math.min(1, tRaw));

      const projLat = startLat + tClamped * (destLat - startLat);
      const projLng = startLng + tClamped * (destLng - startLng);

      const lateralKm = calculateDistance(lat, lng, projLat, projLng);

      return { lateralKm, tRaw };
    };

    // ============================================================
    // 📦 FETCH STOPS
    // ============================================================
    const { data: allStops, error: queryError } = await supabaseAdmin
      .from("stops")
      .select("*")
      .gte("latitude", minLat)
      .lte("latitude", maxLat)
      .gte("longitude", minLng)
      .lte("longitude", maxLng);

    if (queryError) {
      return { success: false, stops: [], error: queryError.message };
    }

    if (!allStops || allStops.length === 0) {
      return { success: true, stops: [] };
    }

    console.log("[2/3] Fetched stops", { total: allStops.length });

    // ============================================================
    // 🧩 ENRICH ONLY (NO FILTER, NO LIMIT)
    // ============================================================
    const enrichedStops = allStops.map((stop) => {
      const distFromStart = calculateDistance(startLat, startLng, stop.latitude, stop.longitude);
      const distFromDest = calculateDistance(stop.latitude, stop.longitude, destLat, destLng);

      const { lateralKm, tRaw } = routeProjection(stop.latitude, stop.longitude);

      const isForward =
        tRaw >= -ROUTE_TOLERANCE && tRaw <= 1 + ROUTE_TOLERANCE;

      // Use appropriate threshold based on verification status
      const isVerified = stop.verification_status === "AAO Verified";
      const maxLateralKm = isVerified ? MAX_LATERAL_KM_VERIFIED : MAX_LATERAL_KM_GOOGLE;
      
      const isValid =
        lateralKm <= maxLateralKm && isForward;

      return {
        id: stop.id,
        name: stop.location_name,
        latitude: stop.latitude,
        longitude: stop.longitude,

        distance_from_start_km: Math.round(distFromStart * 10) / 10,
        distance_to_dest_km: Math.round(distFromDest * 10) / 10,
        distance_to_route_km: Math.round(lateralKm * 10) / 10,

        tRaw: Number(tRaw.toFixed(3)),
        is_valid: isValid,
        is_verified: isVerified,
      };
    });


    console.log("[3/3] Returning enriched stops", {
      total: enrichedStops.length,
      valid: enrichedStops.filter(s => s.is_valid).length
    });

    // ============================================================
    // ✅ RETURN ALL DATA
    // ============================================================
    return {
      success: true,
      stops: enrichedStops.filter(s => s.is_valid),
    };

  } catch (error) {
    return {
      success: false,
      stops: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
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

    const apiKey = process.env.NEXT_PUBLIC_GMAPS_API_KEY
    if (!apiKey) {
      return {
        success: false,
        stopsGenerated: 0,
        error: "Google Maps API key not configured",
      }
    }

    const directDistanceKmForProbes = calculateDistance(startLat, startLng, destLat, destLng)

    // Fetch the actual road polyline so probe points land on the highway, not in the ocean.
    let routePolyline: Array<{ lat: number; lng: number }> | null = null
    let routeCumTable: number[] | null = null
    try {
      const dirParams = new URLSearchParams({
        origin: `${startLat},${startLng}`,
        destination: `${destLat},${destLng}`,
        mode: "driving",
        key: apiKey,
      })
      const dirRes = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${dirParams}`)
      const dirData = await dirRes.json()
      if (dirData.status === "OK" && dirData.routes?.length) {
        const encoded = dirData.routes[0]?.overview_polyline?.points
        if (encoded) {
          routePolyline = decodePolyline(encoded)
          routeCumTable = buildCumulativeDistanceTable(routePolyline)
        }
      }
    } catch {
      // Straight-line fallback used below
    }

    // More probe points for longer routes. Minimum is 2× tripDays so each day segment has at
    // least two probe points, giving enough coverage for stops in sparse outback corridors.
    const baseProbeCount = Math.max(safeTripDays * 2, Math.ceil(directDistanceKmForProbes / 100))
    const probeCount = directDistanceKmForProbes > env.PROBE_DISTANCE_THRESHOLD ? Math.min(50, baseProbeCount) : Math.min(30, baseProbeCount)
    const totalRouteKm = routeCumTable ? routeCumTable[routeCumTable.length - 1] : directDistanceKmForProbes
    const evenlySpacedFractions = Array.from({ length: probeCount }, (_, i) => (i + 1) / (probeCount + 1))
    const endpointFractions = [0.9, 0.95, 0.98, 1]
    const probeFractions = Array.from(new Set([...evenlySpacedFractions, ...endpointFractions]))
      .filter((fraction) => fraction > 0 && fraction <= 1)
      .sort((a, b) => a - b)

    const probePoints = probeFractions.map((fraction) => {
      if (routePolyline && routeCumTable) {
        return samplePolylineAtKm(fraction * totalRouteKm, routePolyline, routeCumTable)
      }
      return {
        lat: startLat + (destLat - startLat) * fraction,
        lng: startLng + (destLng - startLng) * fraction,
      }
    })

    // Irrelevant name patterns to exclude from overnight stop options.
    // Fuel/service stations are excluded by name even when returned under campground searches
    // (e.g. "BP Bamaga Roadhouse", "Injinoo Fuel Station", "Seisia Service Station").
    // Roadhouse is NOT excluded — outback roadhouses often have genuine camping.
    const OVERNIGHT_EXCLUDE = /hotel|motel|hostel|backpacker|resort|inn\b|b&b|bed and breakfast|airbnb|toilet|toilets|amenities|amenity block|public toilet|car park|parking area|day use area|service station|fuel station|petrol station|\bservo\b|\bgas station\b/i

    // 30 km radius keeps probes on the highway corridor. Polyline-based probe points
    // are already on the road, so a tight radius is sufficient and avoids pulling in
    // off-route locations (e.g. island resorts, offshore campgrounds).
    const searchRadius = env.PROBE_SEARCH_RADIUS

    // Australian caravan / camping focused search types.
    // rv_park = Google's type for caravan parks, holiday parks, tourist parks.
    // campground = national park camps, free camps, bush camps, showgrounds.
    const overnightSearches: Array<{ type: string; keyword?: string; radius: number }> = [
      { type: "rv_park", radius: searchRadius },
      { type: "campground", radius: searchRadius },
      { type: "rv_park", keyword: "caravan park", radius: searchRadius },
      { type: "rv_park", keyword: "holiday park", radius: searchRadius },
      { type: "rv_park", keyword: "tourist park", radius: searchRadius },
      { type: "rv_park", keyword: "van park", radius: searchRadius },
      { type: "campground", keyword: "free camp", radius: searchRadius },
      { type: "campground", keyword: "bush camp", radius: searchRadius },
      { type: "campground", keyword: "showground", radius: searchRadius },
      { type: "campground", keyword: "roadhouse", radius: searchRadius },
      { type: "campground", keyword: "station stay", radius: searchRadius },
      { type: "campground", keyword: "national park", radius: searchRadius },
      { type: "gas_station", keyword: "truck stop", radius: searchRadius },
    ]

    if (directDistanceKmForProbes > 300) {
      overnightSearches.push(
        { type: "campground", keyword: "council campsite", radius: searchRadius },
        { type: "campground", keyword: "lakeside", radius: searchRadius },
        { type: "campground", keyword: "riverside", radius: searchRadius },
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
            const maxResultsPerSearch = directDistanceKmForProbes > 300 ? 20 : 10
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

                // Reject results too far off the actual road corridor.
                // Use polyline projection when available (accurate for coastal/curved routes).
                // 25 km threshold prevents offshore islands (e.g. Whitsunday Island is ~31 km
                // from the Bruce Highway) while allowing normal highway-adjacent stops.
                let lateralKm: number
                let tRaw: number
                let routeDistanceFromStartKm: number
                if (routePolyline && routeCumTable) {
                  const { distanceFromStartKm: dfs, lateralKm: lkm } = projectPointOntoPolyline(lat, lng, routePolyline, routeCumTable)
                  lateralKm = lkm
                  routeDistanceFromStartKm = dfs
                  const totalKm = routeCumTable[routeCumTable.length - 1]
                  tRaw = totalKm > 0 ? dfs / totalKm : 0
                } else {
                  const distanceFromStart = calculateDistance(startLat, startLng, lat, lng)
                  const avgLatRad = ((startLat + destLat) / 2) * Math.PI / 180
                  const scaleX = Math.cos(avgLatRad)
                  const vx = (destLng - startLng) * scaleX
                  const vy = destLat - startLat
                  const wx = (lng - startLng) * scaleX
                  const wy = lat - startLat
                  const vLenSq = vx * vx + vy * vy
                  tRaw = vLenSq > 1e-12 ? (wx * vx + wy * vy) / vLenSq : 0
                  const tClamped = Math.max(0, Math.min(1, tRaw))
                  const projLat = startLat + tClamped * (destLat - startLat)
                  const projLng = startLng + tClamped * (destLng - startLng)
                  lateralKm = calculateDistance(lat, lng, projLat, projLng)
                  routeDistanceFromStartKm = distanceFromStart
                }
                if (tRaw < -0.05 || tRaw > 1.05) return
                if (lateralKm > 25) return

                customStopCandidates.push({
                  trip_id: tripId,
                  location_name: name,
                  latitude: String(lat),
                  longitude: String(lng),
                  place_type: "campground",
                  distance_from_start_km: Math.round(routeDistanceFromStartKm * 10) / 10,
                })
              }
            })
          }
        } catch (error) {
          console.warn(`Failed to search ${search.type} at probe point:`, error)
        }
      }
    }

    const routeDistanceKm = totalRouteKm > 0 ? totalRouteKm : directDistanceKmForProbes
    // Use the explicit requestedCustomStops passed from trip handler, with fallback to distance-based calc
    const targetCustomStops = requestedCustomStops > 0
      ? requestedCustomStops
      : Math.max(2, Math.min(10, Math.round(routeDistanceKm / 180)))

    const orderedCustomCandidates = [...customStopCandidates].sort(
      (a, b) => a.distance_from_start_km - b.distance_from_start_km
    )
    // Dynamic initial spacing based on route length and target
    const initialSpacingKm = Math.max(20, Math.ceil(routeDistanceKm / (targetCustomStops + Math.ceil(targetCustomStops * 0.2))))
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
    // Sort candidates by distance from start so we assign day indices sequentially
    // along the route rather than by raw progress fraction (which clusters at extremes).
    const sortedForDayAssign = [...plannedCustomCandidates].sort(
      (a, b) => a.distance_from_start_km - b.distance_from_start_km
    )

    // Divide the full route into equal-km buckets — one per trip day.
    // Each stop is assigned to the bucket its distance falls into.
    // If a day bucket ends up empty, the nearest stop from an adjacent bucket
    // is borrowed to fill it, preventing phantom empty days.
    const totalKmForDays = routeDistanceKm > 0 ? routeDistanceKm : 1
    const kmPerDay = totalKmForDays / safeTripDays

    // First pass: assign by km bucket
    const dayBuckets: number[] = sortedForDayAssign.map((candidate) => {
      const distKm = Number(candidate.distance_from_start_km)
      return Math.min(safeTripDays - 1, Math.floor(distKm / kmPerDay))
    })

    // Second pass: identify empty days and fill from adjacent stops
    const bucketCounts = Array.from({ length: safeTripDays }, () => 0)
    dayBuckets.forEach((d) => { bucketCounts[d] = (bucketCounts[d] || 0) + 1 })

    const filledBuckets = [...dayBuckets]
    for (let day = 0; day < safeTripDays; day++) {
      if (bucketCounts[day] > 0) continue
      // Find the nearest stop by km distance to the center of this empty day
      const dayCenterKm = (day + 0.5) * kmPerDay
      let bestIdx = -1
      let bestDelta = Infinity
      sortedForDayAssign.forEach((candidate, idx) => {
        const delta = Math.abs(Number(candidate.distance_from_start_km) - dayCenterKm)
        if (delta < bestDelta) { bestDelta = delta; bestIdx = idx }
      })
      if (bestIdx >= 0) {
        filledBuckets[bestIdx] = day
        bucketCounts[day] = 1
      }
    }

    const customStopsToInsert = sortedForDayAssign.map((candidate, idx) => ({
      trip_id: candidate.trip_id,
      location_name: candidate.location_name,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      place_type: candidate.place_type,
      distance_from_start_km: candidate.distance_from_start_km,
      day_index: filledBuckets[idx],
    }))

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
      directDistanceKm: Math.round(directDistanceKmForProbes),
      routeDistanceKm: Math.round(routeDistanceKm),
      maxCandidateDistanceKm: Math.round(Math.max(0, ...customStopCandidates.map((stop) => stop.distance_from_start_km))),
    })

    return {
      success: true,
      stopsGenerated: insertedCustomStopsCount,
      totalFetched,
      afterDedup: customStopCandidates.length,
      routeDistanceKm,
    }
  } catch (error) {
    return {
      success: false,
      stopsGenerated: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    }
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
  title: string
  startLat: number
  startLng: number
  destLat: number
  destLng: number
  tripDurationDays: number
  travelPace: TravelPace
}

const tripGenerationQueue: TripGenerationJob[] = []
let isTripQueueProcessing = false

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

  console.log("[queue] Starting trip generation job", {
    tripId: job.tripId,
    title: job.title,
    travelPace: job.travelPace,
    tripDurationDays: job.tripDurationDays,
    startCoords: [job.startLat, job.startLng],
    destCoords: [job.destLat, job.destLng],
  })

  const directDistanceKm = calculateDistance(
    job.startLat,
    job.startLng,
    job.destLat,
    job.destLng
  );
  console.log("directDistanceKm:", directDistanceKm);

  const estimatedDriveDistanceKm = Math.max(
    directDistanceKm,
    Math.min(directDistanceKm * 1.45, directDistanceKm + 600)
  );
  console.log("estimatedDriveDistanceKm:", estimatedDriveDistanceKm);

  const googleDriveDistanceKm = await getDrivingDistanceKm(
    job.startLat,
    job.startLng,
    job.destLat,
    job.destLng
  )
  const planningDistanceKm = googleDriveDistanceKm ?? estimatedDriveDistanceKm
  console.log("planningDistanceKm:", planningDistanceKm, {
    source: googleDriveDistanceKm ? "google_directions" : "estimated",
  });
  
  const kmPerDay = TRAVEL_PACE_KM[job.travelPace] ?? 175
  console.log("kmPerDay based on travel pace:", kmPerDay);

  const suggestedDays = Math.max(1, Math.ceil(planningDistanceKm / kmPerDay))
  console.log("suggestedDays based on estimated distance and pace:", suggestedDays);

  await supabaseAdmin
    .from("trips")
    .update({
      suggested_days: suggestedDays,
      total_distance_km: Math.round(planningDistanceKm),
    })
    .eq("id", job.tripId)

  const { success: generateSuccess, stops: dbStops, error: generateError } = await generateStop(
    job.startLat,
    job.startLng,
    job.destLat,
    job.destLng
  )

  console.log("dbStops:", dbStops[0], "total:", dbStops.length);
  console.log("job result:", job)

  if (generateError) {
    console.warn("[2/4] Stop generation warning:", generateError)
  }

  if (generateSuccess && dbStops.length > 0) {
    const stopInserts = dbStops.map((stop) => ({
      trip_id: job.tripId,
      stop_id: stop.id,
      distance_to_route_km: stop.distance_to_route_km,
      rank_score: stop.tRaw,
      distance_from_start_km: stop.distance_from_start_km,
      source_type: "verified",
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

  const dbStopDistancesKm = dbStops
    .map((stop) => (stop as { distance_from_start_km?: number }).distance_from_start_km ?? 0)
    .filter((distance) => distance > 0);

  console.log("dbStopDistancesKm:", dbStopDistancesKm);

  console.log("[3/4] Generating custom stops from Google Places...", {
    searchTypes: ["rv_park", "campground", "caravan park"],
    tripDurationDays: job.tripDurationDays,
    suggestedDays,
  })

  // Use suggestedDays (realistic based on distance+pace) rather than
  // job.tripDurationDays (user's original request) so that a 1-day request
  // that auto-adjusts to 3 days still generates enough Google Places stops.
  const effectiveDaysForCustomStops = Math.max(suggestedDays, job.tripDurationDays)
  const dayBasedStopTarget = effectiveDaysForCustomStops * 3
  const distanceBasedStopCap = Math.max(1, Math.ceil(planningDistanceKm / 90))
  const minimumOvernightOptions = effectiveDaysForCustomStops <= 1 ? 3 : 1
  const targetTotalStops = Math.max(minimumOvernightOptions, Math.min(dayBasedStopTarget, distanceBasedStopCap))
  const customStopsNeeded = Math.max(0, targetTotalStops - generatedStopsCount)

  const {
    success: customSuccess,
    stopsGenerated = 0,
    totalFetched = 0,
    afterDedup = 0,
    routeDistanceKm: customRouteDistanceKm,
    error: customError,
  } = await generateCustomStop(
    job.startLat,
    job.startLng,
    job.destLat,
    job.destLng,
    job.tripId,
    effectiveDaysForCustomStops,
    dbStopDistancesKm,
    customStopsNeeded
  )

  if (customError) {
    console.warn("[3/4] Custom stop generation warning:", customError)
  }

  if (customSuccess) {
    customStopsCount = stopsGenerated
    console.log("[3/4] Generated custom stops", {
      count: customStopsCount,
      totalFetched,
      afterDedup,
    })
  } else {
    console.log("[3/4] Custom stop generation skipped or failed", {
      totalFetched,
      afterDedup,
    })
  }

  console.log("[4/4] Organizing stops by day...", {
    suggestedDays,
    userDays: job.tripDurationDays,
    verifiedStops: generatedStopsCount,
    customStops: customStopsCount,
  })


  // Use suggested days as base - if user requests fewer days than realistic,
  // auto-adjust to suggested days to ensure drivable daily distances
  const finalTripDays = job.tripDurationDays >= suggestedDays 
    ? job.tripDurationDays 
    : suggestedDays
  
  const daysAdjusted = job.tripDurationDays < suggestedDays
  const daysAdjustment = daysAdjusted
    ? {
        originalDays: job.tripDurationDays,
        adjustedToDays: suggestedDays,
        reason: `Requested ${job.tripDurationDays} days would require ${Math.round(planningDistanceKm / job.tripDurationDays)} km/day. Using ${suggestedDays} days (${Math.round(planningDistanceKm / suggestedDays)} km/day) for realistic pacing.`,
      }
    : null
  if (daysAdjusted) {
    console.log("[4/4] Days auto-adjusted", {
      original: job.tripDurationDays,
      adjustedTo: suggestedDays,
      reason: daysAdjustment?.reason,
    })
  }

  const organizationDistanceKm = customRouteDistanceKm ?? planningDistanceKm
  await organizeStopsByDay(
    job.tripId,
    job.startLat,
    job.startLng,
    job.destLat,
    job.destLng,
    finalTripDays,
    organizationDistanceKm
  )

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

  const { data: itineraryCheck } = await supabaseAdmin
    .from("trip_itineraries")
    .select("version, source")
    .eq("trip_id", job.tripId)
    .eq("source", "system")
    .order("version", { ascending: false })
    .limit(1)
    .single()

  if (itineraryCheck && itineraryCheck.version === 1) {
    console.log("[narrative] Auto-generating TrackMate Overview for v1 trip", { tripId: job.tripId })
    try {
      await generateNarrativeForNewTrip(
        job.tripId,
        job.startLat,
        job.startLng,
        job.destLat,
        job.destLng,
        organizationDistanceKm,
        finalTripDays
      )
      console.log("[narrative] TrackMate Overview auto-generated successfully for trip", job.tripId)
    } catch (narrativeError) {
      console.error("[narrative] Failed to auto-generate TrackMate Overview:", narrativeError)
    }
  }
}

async function processTripGenerationQueue(): Promise<void> {
  if (isTripQueueProcessing) return
  isTripQueueProcessing = true

  while (tripGenerationQueue.length > 0) {
    const nextJob = tripGenerationQueue.shift()
    if (!nextJob) continue

    try {
      await processTripGenerationJob(nextJob)
    } catch (error) {
      console.error("[queue] ❌ Trip generation job failed", {
        tripId: nextJob.tripId,
        error: error instanceof Error ? error.message : String(error),
      })

      if (supabaseAdmin) {
        await supabaseAdmin
          .from("trips")
          .update({ status: "planned" })
          .eq("id", nextJob.tripId)
      }
    }
  }

  isTripQueueProcessing = false
}

function enqueueTripGeneration(job: TripGenerationJob): number {
  tripGenerationQueue.push(job)
  void processTripGenerationQueue()
  return tripGenerationQueue.length
}

interface DayStopOption {
  id: string
  sourceType: "verified" | "custom"
  name: string
  latitude: number
  longitude: number
  distanceFromStartKm: number
  stopId?: string
  customStopId?: string
}

async function organizeStopsByDay(
  tripId: string,
  startLat: number,
  startLng: number,
  destLat: number,
  destLng: number,
  tripDays: number,
  totalDistanceKm: number
): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error("Database not configured")
  }

  const userDays = Math.max(1, Math.round(Number(tripDays) || 1))
  const kmPerDay = totalDistanceKm / userDays

  const { data: verifiedStops } = await supabaseAdmin
    .from("trip_candidate_stops")
    .select("*, stops:stops(id, location_name, latitude, longitude)")
    .eq("trip_id", tripId)
    .eq("source_type", "verified")

  const { data: customStops, error: customStopsError } = await supabaseAdmin
    .from("custom_stops")
    .select("id, location_name, latitude, longitude, place_type, distance_from_start_km")
    .eq("trip_id", tripId)

  if (customStopsError) {
    console.error("[4/4] Failed to load custom stops for day organization:", customStopsError)
  }

  const allStops: DayStopOption[] = []

  if (verifiedStops) {
    for (const vs of verifiedStops) {
      const stop = vs.stops as { id: string; location_name: string; latitude: number; longitude: number } | null
      if (stop) {
        const distFromStart = vs.distance_from_start_km ??
          (vs.distance_to_route_km ?? calculateDistance(startLat, startLng, stop.latitude, stop.longitude))
        allStops.push({
          id: stop.id,
          sourceType: "verified",
          name: stop.location_name,
          latitude: stop.latitude,
          longitude: stop.longitude,
          distanceFromStartKm: distFromStart,
          stopId: stop.id,
        })
      }
    }
  }

  if (customStops) {
    for (const cs of customStops) {
      const latitude = typeof cs.latitude === "number" ? cs.latitude : Number(cs.latitude)
      const longitude = typeof cs.longitude === "number" ? cs.longitude : Number(cs.longitude)
      allStops.push({
        id: cs.id,
        sourceType: "custom",
        name: cs.location_name,
        latitude,
        longitude,
        distanceFromStartKm: cs.distance_from_start_km ?? calculateDistance(startLat, startLng, latitude, longitude),
        customStopId: cs.id,
      })
    }
  }

  console.log("[4/4] All stops before sorting:", {
    total: allStops.length,
    verified: allStops.filter(s => s.sourceType === "verified").length,
    custom: allStops.filter(s => s.sourceType === "custom").length,
    sample: allStops.slice(0, 3).map(s => ({ name: s.name, dist: s.distanceFromStartKm })),
    maxDistanceKm: Math.round(Math.max(0, ...allStops.map((s) => s.distanceFromStartKm))),
  })

  allStops.sort((a, b) => a.distanceFromStartKm - b.distanceFromStartKm)

  const sortedByPriority = [
    ...allStops.filter((s) => s.sourceType === "verified"),
    ...allStops.filter((s) => s.sourceType === "custom"),
  ]

  const dayOptions: Array<{
    dayNumber: number
    targetKm: number
    options: DayStopOption[]
  }> = []

  let currentDay = 1
  while (currentDay <= userDays) {
    const targetKm = kmPerDay * currentDay
    const minKm = currentDay === 1 ? 0 : kmPerDay * (currentDay - 1)

    console.log("[4/4] Processing day", currentDay, { targetKm, minKm, totalStops: sortedByPriority.length })

    // More lenient filter: include stops within range of current day segment
    const relevantStops = sortedByPriority.filter(
      (s) => s.distanceFromStartKm <= targetKm + kmPerDay * 0.5 &&
        s.distanceFromStartKm >= minKm - kmPerDay * 0.2
    )

    console.log("[4/4] Relevant stops for day", currentDay, {
      found: relevantStops.length,
      inRange: relevantStops.map(s => s.name)
    })

    const uniqueByName = new Map<string, DayStopOption>()
    for (const stop of relevantStops) {
      const key = stop.name.toLowerCase().trim()
      if (!uniqueByName.has(key)) {
        uniqueByName.set(key, stop)
      }
    }

    let options = Array.from(uniqueByName.values())
      .sort((a, b) => Math.abs(a.distanceFromStartKm - targetKm) - Math.abs(b.distanceFromStartKm - targetKm))
      .slice(0, 3)

    // If not enough options, fill from nearest forward candidates only.
    // Pulling from the beginning of the route makes later days look empty after
    // the planner rejects backward/non-progressing overnight choices.
    if (options.length < 3) {
      const fallbackMinKm = Math.max(0, minKm - Math.min(25, kmPerDay * 0.1))
      const remaining = sortedByPriority
        .filter((s) => s.distanceFromStartKm >= fallbackMinKm)
        .filter(s => !options.some(o => o.id === s.id))
        .sort((a, b) => Math.abs(a.distanceFromStartKm - targetKm) - Math.abs(b.distanceFromStartKm - targetKm))
      options = [...options, ...remaining].slice(0, 3)
    }

    console.log("[4/4] Selected options for day", currentDay, {
      count: options.length,
      options: options.map(o => ({ name: o.name, dist: Math.round(o.distanceFromStartKm) }))
    })

    options.length = Math.min(options.length, 3)

    dayOptions.push({
      dayNumber: currentDay,
      targetKm,
      options,
    })

    currentDay++
  }

  const existingItinerary = await supabaseAdmin
    .from("trip_itineraries")
    .select("version")
    .eq("trip_id", tripId)
    .order("version", { ascending: false })
    .limit(1)
    .single()

  const nextVersion = (existingItinerary?.data?.version ?? 0) + 1

  await supabaseAdmin
    .from("trip_itineraries")
    .update({ status: "superseded" })
    .eq("trip_id", tripId)
    .eq("status", "active")

  const stopsByDayJson: Record<string, unknown> = {}
  const itineraryDayRows: Array<{
    itinerary_id?: string
    day_number: number
    day_order: number
    source_type: string
    stop_id: string | null
    custom_stop_id: string | null
    is_selected: boolean
    from_location: string
    to_location: string
    distance_km: number | null
  }> = []

  for (const day of dayOptions) {
    const dayStopsJson: Array<{
      id: string
      name: string
      sourceType: string
      isSelected: boolean
      dayOrder: number
    }> = []

    for (let i = 0; i < day.options.length; i++) {
      const opt = day.options[i]
      const isSelected = i === 0

      dayStopsJson.push({
        id: opt.id,
        name: opt.name,
        sourceType: opt.sourceType,
        isSelected,
        dayOrder: i + 1,
      })

      itineraryDayRows.push({
        day_number: day.dayNumber,
        day_order: i + 1,
        source_type: opt.sourceType,
        stop_id: opt.stopId ?? null,
        custom_stop_id: opt.customStopId ?? null,
        is_selected: isSelected,
        from_location: day.dayNumber === 1 ? "Start" : `Day ${day.dayNumber - 1}`,
        to_location: opt.name,
        distance_km: Math.round(kmPerDay),
      })
    }

    stopsByDayJson[`day${day.dayNumber}`] = dayStopsJson
  }

  const { data: itineraryRecord, error: itineraryError } = await supabaseAdmin
    .from("trip_itineraries")
    .insert({
      trip_id: tripId,
      version: nextVersion,
      source: "system",
      status: "active",
      stops_by_day_json: stopsByDayJson,
    })
    .select("id")
    .single()

  if (itineraryError) {
    console.error("Failed to create itinerary:", itineraryError)
    return
  }

  if (itineraryRecord && itineraryDayRows.length > 0) {
    const rowsWithItineraryId = itineraryDayRows.map((row) => ({
      ...row,
      itinerary_id: itineraryRecord.id,
    }))

    await supabaseAdmin.from("itinerary_days").insert(rowsWithItineraryId)
  }

  console.log("[4/4] Organized stops by day", {
    tripId,
    days: userDays,
    totalStopsAvailable: sortedByPriority.length,
    optionsPerDay: dayOptions.map((d) => d.options.length),
    totalRows: itineraryDayRows.length,
    dayDetails: dayOptions.map(d => ({
      day: d.dayNumber,
      options: d.options.map(o => ({ name: o.name, source: o.sourceType }))
    }))
  })
}

async function generateNarrativeForNewTrip(
  tripId: string,
  startLat: number,
  startLng: number,
  destLat: number,
  destLng: number,
  totalDistanceKm: number,
  tripDays: number
): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error("Database not configured")
  }

  console.log("[narrative] Starting auto-generation for trip", { tripId })

  const { data: tripData } = await supabaseAdmin
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .single()

  if (!tripData) {
    throw new Error("Trip not found")
  }

  const { data: itineraryDays } = await supabaseAdmin
    .from("itinerary_days")
    .select("*")
    .eq("itinerary_id", (
      await supabaseAdmin
        .from("trip_itineraries")
        .select("id")
        .eq("trip_id", tripId)
        .eq("source", "system")
        .eq("status", "active")
        .single()
    )?.data?.id ?? "")
    .order("day_number", { ascending: true })

  const { data: candidateStops } = await supabaseAdmin
    .from("trip_candidate_stops")
    .select("*, stops:stops(id, location_name, stay_type, route_type, aao_tip, why_stop_here, why_we_d_stay_again, road_suitability)")
    .eq("trip_id", tripId)
    .eq("source_type", "verified")

  const { data: customStopsData, error: customStopsDataError } = await supabaseAdmin
    .from("custom_stops")
    .select("id, location_name, place_type, distance_from_start_km")
    .eq("trip_id", tripId)

  if (customStopsDataError) {
    console.error("[narrative] Failed to load custom stops:", customStopsDataError)
  }

  const kmPerDay = totalDistanceKm / tripDays

  interface DayPayload {
    dayNumber: number
    fromLocation: string | null
    toLocation: string | null
    distanceKm: number
    driveTimeMinutes: number
    verifiedStops: Array<{
      location_name: string
      stay_type: string | null
      route_type: string | null
      aao_tip: string | null
      why_stop_here: string | null
      why_we_d_stay_again: string | null
    }>
    optionStops: Array<{
      location_name: string
      stay_type: string | null
      route_type: string | null
      aao_tip: string | null
      why_stop_here: string | null
      why_we_d_stay_again: string | null
      is_verified: boolean
    }>
    allowedStopNames: string[]
    fuelCritical: boolean
    isRemote: boolean
    fuelWarning: string | null
    primaryFuelStop: null
    gapFromLastFuelKm: number | null
    gapToNextFuelKm: number | null
    degradedMode: boolean
  }

  const daysPayload: DayPayload[] = []
  for (let dayNum = 1; dayNum <= tripDays; dayNum++) {
    const dayItineraryRows = itineraryDays?.filter(row => row.day_number === dayNum) ?? []

    const verifiedStops = candidateStops
      ?.filter(cs => {
        const stop = cs.stops as { id: string; location_name: string; stay_type?: string; route_type?: string; aao_tip?: string; why_stop_here?: string; why_we_d_stay_again?: string; road_suitability?: string } | null
        if (!stop) return false
        const distFromStart = cs.distance_from_start_km ?? 0
        const dayTargetKm = kmPerDay * dayNum
        const dayMinKm = kmPerDay * (dayNum - 1)
        return distFromStart >= dayMinKm - kmPerDay * 0.2 && distFromStart <= dayTargetKm + kmPerDay * 0.5
      })
      .map(cs => {
        const stop = cs.stops as { location_name: string; stay_type?: string; route_type?: string; aao_tip?: string; why_stop_here?: string; why_we_d_stay_again?: string; road_suitability?: string }
        return {
          location_name: stop.location_name,
          stay_type: stop.stay_type ?? null,
          route_type: stop.route_type ?? null,
          aao_tip: stop.aao_tip ?? null,
          why_stop_here: stop.why_stop_here ?? null,
          why_we_d_stay_again: stop.why_we_d_stay_again ?? null,
        }
      }) ?? []

    const otherStops = customStopsData
      ?.filter(cs => {
        const distFromStart = cs.distance_from_start_km ?? 0
        const dayTargetKm = kmPerDay * dayNum
        const dayMinKm = kmPerDay * (dayNum - 1)
        return distFromStart >= dayMinKm - kmPerDay * 0.2 && distFromStart <= dayTargetKm + kmPerDay * 0.5
      })
      .map(cs => ({
        location_name: cs.location_name,
        stay_type: cs.place_type ?? null,
        route_type: cs.place_type ?? null,
        aao_tip: null,
        why_stop_here: null,
        why_we_d_stay_again: null,
        road_suitability: null,
      })) ?? []

    const optionStops = [...verifiedStops, ...otherStops].map(s => ({
      location_name: s.location_name,
      stay_type: s.stay_type ?? null,
      route_type: s.route_type ?? null,
      aao_tip: s.aao_tip ?? null,
      why_stop_here: s.why_stop_here ?? null,
      why_we_d_stay_again: s.why_we_d_stay_again ?? null,
      is_verified: verifiedStops.some(vs => vs.location_name === s.location_name),
    }))

    const allowedStopNames = Array.from(new Set(optionStops.map(s => s.location_name).filter(Boolean)))

    const fromLocation = dayNum === 1
      ? tripData.start_location_text
      : dayItineraryRows[0]?.to_location ?? null

    const toLocation = dayNum === tripDays
      ? tripData.destination_text
      : dayItineraryRows[0]?.to_location ?? null

    daysPayload.push({
      dayNumber: dayNum,
      fromLocation,
      toLocation,
      distanceKm: Math.round(kmPerDay),
      driveTimeMinutes: Math.round(kmPerDay / 80 * 60),
      verifiedStops,
      optionStops,
      allowedStopNames,
      fuelCritical: false,
      isRemote: false,
      fuelWarning: null,
      primaryFuelStop: null,
      gapFromLastFuelKm: null,
      gapToNextFuelKm: null,
      degradedMode: false,
    })
  }

  let travelMonth: string | null = null
  if (tripData.end_date) {
    const halfMs = ((tripData.trip_duration_days || 1) / 2) * 24 * 60 * 60 * 1000
    const midpoint = new Date(new Date(tripData.end_date).getTime() - halfMs)
    travelMonth = midpoint.toLocaleString("en-AU", { month: "long" })
  }

  const hasGravelSegments = candidateStops?.some(cs => {
    const stop = cs.stops as { road_suitability?: string } | null
    return stop?.road_suitability?.toLowerCase() === "gravel" || stop?.road_suitability?.toLowerCase() === "4wd"
  }) ?? false
  const roadConditionNote = hasGravelSegments
    ? "Some overnight stop options on this route require gravel or 4WD access. Verify road conditions before committing to each leg."
    : null

  const corridor = `${tripData.start_location_text} to ${tripData.destination_text}`

  const fuelSummary = {
    totalFuelStations: 0,
    fuelCriticalDays: 0,
    remoteDays: 0,
    planningMode: "standard",
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY })

  const SYSTEM_PROMPT = `You are a travel writing assistant for an Australian caravan/RV road trip planner called TrackMate.
Given structured trip data, produce a JSON object with this EXACT shape — no extra keys, no missing keys:

{
  "overview": "<1-2 sentences summarising the full trip, mentioning rig type if provided>",
  "days": [
    {
      "dayNumber": 1,
      "narrative": "<2-3 sentences about the day's drive — terrain, region highlights, character. Do NOT name a stop here.>",
      "suggestedStay": {
        "name": "<exact location_name from this day's allowedStopNames, or null if allowedStopNames is empty>",
        "stopType": "<stay_type or route_type value from optionStops record for that stop>",
        "whyStopHere": "<why_stop_here value from that stop, or a 1-sentence reason if field is empty>",
        "aaoTip": "<aao_tip value from that stop, or empty string if none>"
      },
      "aaoTips": ["<tip drawn from aao_tip / why_stop_here / why_we_d_stay_again of verifiedStops>"],
      "gapNote": "<1-sentence planning caution if degradedMode=true OR allowedStopNames is empty, otherwise null>",
      "fuelNote": "<1-sentence fuel guidance if fuelCritical=true OR gapFromLastFuelKm>200 OR gapToNextFuelKm>200, otherwise null>"
    }
  ],
  "tripNotes": {
    "fuelGuidance": "<overall fuel planning note if fuelCriticalDays>0 or remoteDays>0, otherwise null>",
    "remoteWarnings": "<remote stretch warning if remoteDays>0 or planningMode=degraded-valid, otherwise null>",
    "roadConditions": "<road condition note if roadConditionNote is provided OR any day has fuelWarning mentioning dirt/gravel/unsealed, otherwise null>",
    "rigSuitability": "<rig suitability note if rig_type/rig_length_m is provided — comment on route suitability for that rig, otherwise null>",
    "seasonalNotes": "<seasonal tip if travelMonth is provided — note best/worst conditions for that month on this route, otherwise null>"
  },
  "generatedAt": "<ISO timestamp>"
}

STRICT RULES — violation will break the app:
1. STOP ENFORCEMENT: suggestedStay.name MUST be an exact value from that day's allowedStopNames array. If allowedStopNames is empty, set suggestedStay to null. NEVER invent a stop name not in allowedStopNames.
2. FUEL: populate fuelNote and tripNotes.fuelGuidance from the fuelCritical / gapFromLastFuelKm / gapToNextFuelKm / fuelWarning fields provided. Do not invent fuel information.
3. GAPS: if allowedStopNames is empty for a day, set suggestedStay to null and write a gapNote stating no overnight stop is available on that stretch.
4. VERIFIED CONTEXT: if verifiedStops is empty but allowedStopNames has values, do NOT claim the leg has no stop options.
5. OUTPUT: respond with ONLY the raw JSON object. No markdown fences, no explanation, no trailing text.
6. RIG: if trip.rig_type is provided, note any clearance or length limitations relevant to this route. If avoid_gravel_roads is true, confirm the planned route avoids unsealed roads.
7. SEASONAL: if travelMonth is provided, add a brief note about seasonal conditions for that month on this corridor (e.g. wet season flooding risk, winter cold, summer heat).`

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 2048,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Generate narrative for:\n\n${JSON.stringify(
          {
            trip: {
              title: tripData.title,
              travel_pace: tripData.travel_pace,
              trip_duration_days: tripData.trip_duration_days,
              rig_type: tripData.rig_type ?? null,
              rig_length_m: tripData.rig_length_m ?? null,
              avoid_gravel_roads: tripData.avoid_gravel_roads ?? false,
              pet_friendly_required: tripData.pet_friendly_required ?? false,
            },
            corridor,
            totalDistanceKm,
            fuelSummary,
            days: daysPayload,
            travelMonth,
            roadConditionNote,
          },
          null,
          2
        )}\n\nRespond with ONLY the JSON object. Remember: suggestedStay.name must be an exact value from each day's allowedStopNames array. Populate tripNotes.rigSuitability if trip.rig_type is provided. Populate tripNotes.seasonalNotes if travelMonth is provided. Populate tripNotes.roadConditions from roadConditionNote if provided.`,
      },
    ],
  })

  const raw = response.choices[0]?.message?.content?.trim() ?? ""
  let narrative

  try {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "")
    narrative = JSON.parse(cleaned)
  } catch {
    console.warn("[narrative] Using fallback narrative due to parse error")
    narrative = {
      overview: `${tripData.title}: A ${tripDays}-day trip covering about ${Math.round(totalDistanceKm)} km through remote Australian routes with planned overnight anchors and fuel checks.`,
      days: daysPayload.map((day) => ({
        dayNumber: day.dayNumber,
        narrative: `Day ${day.dayNumber} runs from ${day.fromLocation || "start"} toward ${day.toLocation || "the next leg"}, covering about ${Math.round(day.distanceKm || 0)} km through remote Australian terrain.`,
        suggestedStay: day.allowedStopNames[0] ? {
          name: day.allowedStopNames[0],
          stopType: day.optionStops.find(s => s.location_name === day.allowedStopNames[0])?.stay_type || "campground",
          whyStopHere: "Useful overnight break point for this leg.",
          aaoTip: "",
        } : null,
        aaoTips: [],
        gapNote: day.allowedStopNames.length === 0 ? "No overnight stop is available on this stretch. Plan this leg carefully before departure." : null,
        fuelNote: null,
      })),
      tripNotes: {
        fuelGuidance: null,
        remoteWarnings: null,
        roadConditions: roadConditionNote,
        rigSuitability: tripData.rig_type ? `This route was planned for a ${tripData.rig_type}${tripData.rig_length_m ? ` (${tripData.rig_length_m}m)` : ""}. ${tripData.avoid_gravel_roads ? "Gravel roads are avoided in stop selection." : "Verify access conditions at each stop before arrival."}` : null,
        seasonalNotes: travelMonth ? `Travelling in ${travelMonth}: check seasonal road conditions and campsite availability for this time of year.` : null,
      },
      generatedAt: new Date().toISOString(),
    }
  }

  narrative.generatedAt = new Date().toISOString()

  const { data: v1Itinerary } = await supabaseAdmin
    .from("trip_itineraries")
    .select("id")
    .eq("trip_id", tripId)
    .eq("source", "system")
    .eq("status", "active")
    .single()

  if (v1Itinerary) {
    await supabaseAdmin
      .from("trip_itineraries")
      .update({
        source: "ai",
        itinerary_json: narrative,
        model_name: "gpt-4o-mini",
        prompt_version: "v1",
        trip_snapshot_json: { trip: tripData, corridor, totalDistanceKm, days: daysPayload },
      })
      .eq("id", v1Itinerary.id)

    const dayRows = (narrative.days as Array<{ dayNumber: number; narrative: string; aaoTips: string[]; gapNote: string | null }>).map((day) => {
      const dayData = daysPayload[day.dayNumber - 1]
      return {
        itinerary_id: v1Itinerary.id,
        day_number: day.dayNumber,
        from_location: dayData?.fromLocation ?? null,
        to_location: dayData?.toLocation ?? null,
        distance_km: dayData?.distanceKm ?? null,
        drive_time_minutes: dayData?.driveTimeMinutes ?? null,
        aao_tip: day.aaoTips?.[0] ?? null,
        reason: day.narrative,
        day_json: day,
      }
    })

    await supabaseAdmin.from("itinerary_days").insert(dayRows)

    console.log("[narrative] Auto-generated TrackMate Overview for trip", { tripId, version: 1 })
  } else {
    console.warn("[narrative] No v1 system itinerary found for trip", tripId)
  }

  const { data: tripRow } = await supabaseAdmin
    .from("trips")
    .select("route_data_json")
    .eq("id", tripId)
    .single()

  const existingJson = (tripRow?.route_data_json as Record<string, unknown>) ?? {}
  await supabaseAdmin
    .from("trips")
    .update({ route_data_json: { ...existingJson, narrative } })
    .eq("id", tripId)
}

async function selectStopOption(
  itineraryDayId: string
): Promise<{ success: boolean; error?: string }> {
  if (!supabaseAdmin) {
    return { success: false, error: "Database not configured" }
  }

  const { data: selectedRow, error: fetchError } = await supabaseAdmin
    .from("itinerary_days")
    .select("day_number, itinerary_id")
    .eq("id", itineraryDayId)
    .single()

  if (fetchError || !selectedRow) {
    return { success: false, error: fetchError?.message ?? "Day not found" }
  }

  await supabaseAdmin
    .from("itinerary_days")
    .update({ is_selected: false })
    .eq("itinerary_id", selectedRow.itinerary_id)
    .eq("day_number", selectedRow.day_number)

  await supabaseAdmin
    .from("itinerary_days")
    .update({ is_selected: true })
    .eq("id", itineraryDayId)

  return { success: true }
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

// 🎯 Final Target Stops
export function getTargetStops(
  distanceKm: number,
  tripDays: number
): number {
  const base = getBaseStops(distanceKm);
  const bonus = getDayBonus(tripDays);
  const max = getMaxStops(distanceKm);

  return Math.max(0, Math.min(base + bonus, max));
}

// 🧩 Custom Stops Needed
export function getCustomStopsNeeded(
  targetStops: number,
  dbStopsCount: number
): number {
  return Math.max(0, targetStops - dbStopsCount);
}

// Validate Coordinates
export function isValidCoord(value: unknown): boolean {
  return Number.isFinite(Number(value));
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

    const queueSizeAfterEnqueue = enqueueTripGeneration({
      tripId: data.id,
      title: data.title,
      startLat: Number(resolvedStartLat),
      startLng: Number(resolvedStartLng),
      destLat: Number(resolvedDestLat),
      destLng: Number(resolvedDestLng),
      tripDurationDays: Number(tripDurationDays) || 1,
      travelPace: safeTravelPace,
    })

    console.log("[queue] 📨 Trip queued for planning", {
      tripId: data.id,
      queueSizeAfterEnqueue,
    })

    return NextResponse.json(
      {
        success: true,
        message: `Trip "${title}" queued for planning`,
        tripId: data.id,
        status: "in_progress",
        queueSize: queueSizeAfterEnqueue,
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
