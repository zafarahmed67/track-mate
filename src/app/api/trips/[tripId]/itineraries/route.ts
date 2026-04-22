import { supabaseAdmin } from "@/config/supabase"
import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

interface RouteParams {
  params: Promise<{ tripId: string }>
}

function extractJsonObject(text: string): string | null {
  const startIndex = text.indexOf("{")
  if (startIndex < 0) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = startIndex; index < text.length; index++) {
    const char = text[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === "{") depth += 1
    if (char === "}") depth -= 1

    if (depth === 0) {
      return text.slice(startIndex, index + 1)
    }
  }

  return null
}

type InputDay = {
  dayNumber: number
  fromLocation?: string | null
  toLocation?: string | null
  distanceKm?: number
  driveTimeMinutes?: number
  allowedStopNames?: string[]
  optionStops?: Array<{
    location_name: string
    stay_type?: string | null
    route_type?: string | null
    why_stop_here?: string | null
    aao_tip?: string | null
    is_verified?: boolean
  }>
  verifiedStops?: Array<{
    location_name: string
    stay_type?: string | null
    route_type?: string | null
    why_stop_here?: string | null
    aao_tip?: string | null
  }>
  degradedMode?: boolean
  fuelCritical?: boolean
  gapFromLastFuelKm?: number | null
  gapToNextFuelKm?: number | null
  fuelWarning?: string | null
}

function buildFallbackNarrative(params: {
  trip: { title?: string; trip_duration_days?: number; rig_type?: string | null; rig_length_m?: number | null; avoid_gravel_roads?: boolean }
  totalDistanceKm?: number
  fuelSummary?: { fuelCriticalDays?: number; remoteDays?: number; planningMode?: string }
  days: InputDay[]
  travelMonth?: string | null
  roadConditionNote?: string | null
}) {
  const { trip, totalDistanceKm, fuelSummary, days, travelMonth, roadConditionNote } = params
  const roundedDistance = Math.round(Number(totalDistanceKm || 0))

  const outDays = days.map((day) => {
    const options = day.optionStops || []
    const allowed = day.allowedStopNames || []
    const chosenName = allowed[0] || null
    const chosen = options.find((s) => s.location_name === chosenName) || options[0]
    const stopType = chosen?.stay_type || chosen?.route_type || "campground"
    const whyStopHere = chosen?.why_stop_here || "Useful overnight break point for this leg."
    const aaoTip = chosen?.aao_tip || ""
    const hasStops = allowed.length > 0
    const gapNote = !hasStops
      ? "No overnight stop is available on this stretch. Plan this leg carefully before departure."
      : (day.degradedMode ? "Options are limited on this stretch; verify access and availability before travel." : null)

    const fuelNote = day.fuelCritical
      ? "Fuel-critical leg: keep reserve fuel and top up whenever possible."
      : (typeof day.gapFromLastFuelKm === "number" && day.gapFromLastFuelKm > 200)
      ? `Long fuel gap: ${Math.round(day.gapFromLastFuelKm)} km since last fuel.`
      : (typeof day.gapToNextFuelKm === "number" && day.gapToNextFuelKm > 200)
      ? `Long fuel gap ahead: next fuel is about ${Math.round(day.gapToNextFuelKm)} km away.`
      : null

    return {
      dayNumber: day.dayNumber,
      narrative: `Day ${day.dayNumber} runs from ${day.fromLocation || "start"} toward ${day.toLocation || "the next leg"}, covering about ${Math.round(Number(day.distanceKm || 0))} km through remote Australian terrain.`,
      suggestedStay: hasStops
        ? {
            name: chosenName,
            stopType,
            whyStopHere,
            aaoTip,
          }
        : null,
      aaoTips: chosen?.aao_tip ? [chosen.aao_tip] : [],
      gapNote,
      fuelNote,
    }
  })

  return {
    overview: `${trip?.title ? `${trip.title}: ` : ""}A ${days.length}-day trip${roundedDistance > 0 ? ` covering about ${roundedDistance} km` : ""} through remote Australian routes with planned overnight anchors and fuel checks.`,
    days: outDays,
    tripNotes: {
      fuelGuidance: (fuelSummary?.fuelCriticalDays || 0) > 0 ? "This route has fuel-critical stretches. Refuel early and often." : null,
      remoteWarnings: (fuelSummary?.remoteDays || 0) > 0 || fuelSummary?.planningMode === "degraded-valid"
        ? "Remote sections may have limited services. Confirm overnight access and fuel before each leg."
        : null,
      roadConditions: roadConditionNote ?? null,
      rigSuitability: trip?.rig_type
        ? `This route was planned for a ${trip.rig_type}${trip.rig_length_m ? ` (${trip.rig_length_m}m)` : ""}. ${trip.avoid_gravel_roads ? "Gravel roads are avoided in stop selection." : "Verify access conditions at each stop before arrival."}`
        : null,
      seasonalNotes: travelMonth
        ? `Travelling in ${travelMonth}: check seasonal road conditions and campsite availability for this time of year.`
        : null,
    },
    generatedAt: new Date().toISOString(),
  }
}

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



interface RouteParams {
  params: Promise<{ tripId: string }>
}

// GET /api/trips/[tripId]/itineraries?user_id=...
// Returns all versions for a trip, ordered newest first, with their day rows
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const { tripId } = await params
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get("user_id")

    if (!tripId || !userId) {
      return NextResponse.json({ success: false, error: "trip_id and user_id are required" }, { status: 400 })
    }

    // Verify trip belongs to user
    const { data: trip, error: tripError } = await supabaseAdmin
      .from("trips")
      .select("id")
      .eq("id", tripId)
      .eq("user_id", userId)
      .single()

    if (tripError || !trip) {
      return NextResponse.json({ success: false, error: "Trip not found" }, { status: 404 })
    }

    // Fetch all itinerary versions
    const { data: itineraries, error } = await supabaseAdmin
      .from("trip_itineraries")
      .select("id, version, status, source, model_name, created_at, itinerary_json")
      .eq("trip_id", tripId)
      .order("version", { ascending: false })

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // For the active version, also fetch its day rows
    const activeItinerary = (itineraries ?? []).find((it) => it.status === "active")
    let activeDays: unknown[] = []

    if (activeItinerary) {
      const { data: days } = await supabaseAdmin
        .from("itinerary_days")
        .select("*")
        .eq("itinerary_id", activeItinerary.id)
        .order("day_number", { ascending: true })

      activeDays = days ?? []
    }

    return NextResponse.json({
      success: true,
      itineraries: itineraries ?? [],
      activeDays,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

// PATCH /api/trips/[tripId]/itineraries
// Restore a specific version (make it active, supersede others)
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const { tripId } = await params
    const { userId, itineraryId } = await req.json()

    if (!tripId || !userId || !itineraryId) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
    }

    // Verify trip belongs to user
    const { data: trip, error: tripError } = await supabaseAdmin
      .from("trips")
      .select("id, route_data_json")
      .eq("id", tripId)
      .eq("user_id", userId)
      .single()

    if (tripError || !trip) {
      return NextResponse.json({ success: false, error: "Trip not found" }, { status: 404 })
    }

    // Verify the itinerary belongs to this trip
    const { data: targetItinerary, error: itinError } = await supabaseAdmin
      .from("trip_itineraries")
      .select("id, itinerary_json")
      .eq("id", itineraryId)
      .eq("trip_id", tripId)
      .single()

    if (itinError || !targetItinerary) {
      return NextResponse.json({ success: false, error: "Itinerary version not found" }, { status: 404 })
    }

    // Supersede all current active versions
    await supabaseAdmin
      .from("trip_itineraries")
      .update({ status: "superseded" })
      .eq("trip_id", tripId)
      .eq("status", "active")

    // Activate the requested version
    await supabaseAdmin
      .from("trip_itineraries")
      .update({ status: "active" })
      .eq("id", itineraryId)

    // Sync restored narrative back to trips.route_data_json for fast loading
    const existingJson = (trip.route_data_json as Record<string, unknown>) ?? {}
    await supabaseAdmin
      .from("trips")
      .update({ route_data_json: { ...existingJson, narrative: targetItinerary.itinerary_json } })
      .eq("id", tripId)

    return NextResponse.json({ success: true, narrative: targetItinerary.itinerary_json })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { tripId } = await params
    const { userId, trip, corridor, totalDistanceKm, fuelSummary, days, travelMonth, roadConditionNote } = await req.json()

    if (!tripId || !userId || !days?.length) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      )
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY })

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
            { trip, corridor, totalDistanceKm, fuelSummary, days, travelMonth, roadConditionNote },
            null,
            2
          )}\n\nRespond with ONLY the JSON object. Remember: suggestedStay.name must be an exact value from each day's allowedStopNames array. Populate tripNotes.rigSuitability if trip.rig_type is provided. Populate tripNotes.seasonalNotes if travelMonth is provided. Populate tripNotes.roadConditions from roadConditionNote if provided.`,
        },
      ],
    })

    const raw = response.choices[0]?.message?.content?.trim() ?? ""
    const finishReason = response.choices[0]?.finish_reason ?? null

    let narrative
    try {
      const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "")
      try {
        narrative = JSON.parse(cleaned)
      } catch {
        const extracted = extractJsonObject(cleaned)
        if (!extracted) throw new Error("Unable to extract JSON object from model output")
        narrative = JSON.parse(extracted)
      }
    } catch {
      console.error("OpenAI returned non-JSON:", raw.slice(0, 500))
      narrative = buildFallbackNarrative({ trip, totalDistanceKm, fuelSummary, days, travelMonth, roadConditionNote })
      console.warn("[narrative] Using deterministic fallback narrative", {
        finishReason,
        dayCount: days.length,
      })
    }

    narrative.generatedAt = new Date().toISOString()

    // --- Stop enforcement validation ---
    // Scrub any suggestedStay whose name is not in the day's allowedStopNames
    if (Array.isArray(narrative.days) && Array.isArray(days)) {
      for (const day of narrative.days as Array<{ dayNumber: number; suggestedStay?: { name: string } | null }>) {
        const inputDay = days.find((d: { dayNumber: number; allowedStopNames?: string[] }) => d.dayNumber === day.dayNumber)
        const allowed: string[] = inputDay?.allowedStopNames ?? []
        if (day.suggestedStay?.name && allowed.length > 0 && !allowed.includes(day.suggestedStay.name)) {
          console.warn(`[narrative] Scrubbed invented stop "${day.suggestedStay.name}" for day ${day.dayNumber}`)
          day.suggestedStay = null
        }
        if (day.suggestedStay?.name && allowed.length === 0) {
          day.suggestedStay = null
        }
      }
    }

    // --- Persist narrative ---
    if (supabaseAdmin) {
      // 1. Get next version number for this trip
      const { data: existingVersions } = await supabaseAdmin
        .from("trip_itineraries")
        .select("version")
        .eq("trip_id", tripId)
        .order("version", { ascending: false })
        .limit(1)

      const nextVersion = existingVersions?.[0]?.version ? existingVersions[0].version + 1 : 1

      // 2. Mark previous active itineraries as superseded
      await supabaseAdmin
        .from("trip_itineraries")
        .update({ status: "superseded" })
        .eq("trip_id", tripId)
        .eq("status", "active")

      // 3. Insert new itinerary record
      const { data: itineraryRecord, error: itineraryError } = await supabaseAdmin
        .from("trip_itineraries")
        .insert({
          trip_id: tripId,
          version: nextVersion,
          source: "ai",
          status: "active",
          trip_snapshot_json: { trip, corridor, totalDistanceKm, days },
          itinerary_json: narrative,
          model_name: "gpt-4o-mini",
          prompt_version: "v1",
        })
        .select("id")
        .single()

      if (!itineraryError && itineraryRecord) {
        // 4. Insert itinerary_days rows
        const dayRows = (narrative.days as Array<{
          dayNumber: number
          narrative: string
          aaoTips: string[]
          gapNote: string | null
          suggestedStay?: { name: string } | null
        }>).map((day) => {
          const dayData = days[day.dayNumber - 1] as {
            distanceKm?: number
            driveTimeMinutes?: number
            fromLocation?: string
            toLocation?: string
          } | undefined
          return {
            itinerary_id: itineraryRecord.id,
            day_number: day.dayNumber,
            from_location: dayData?.fromLocation ?? null,
            to_location: dayData?.toLocation ?? null,
            distance_km: dayData?.distanceKm ?? null,
            drive_time_minutes: dayData?.driveTimeMinutes ?? null,
            aao_tip: day.aaoTips?.[0] ?? null,
            reason: day.narrative,
            day_json: day,
            is_selected: day.suggestedStay?.name != null,
          }
        })

        await supabaseAdmin.from("itinerary_days").insert(dayRows)
      }

      // 5. Patch trip's route_data_json with the new narrative (for quick loading)
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

    return NextResponse.json({ success: true, narrative })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
