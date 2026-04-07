import OpenAI from "openai"
import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/config/supabase"

interface RouteParams {
  params: Promise<{ tripId: string }>
}

const SYSTEM_PROMPT = `You are a travel writing assistant for an Australian caravan/RV road trip planner called TrackMate.
Given structured trip data, produce a JSON object with this EXACT shape — no extra keys, no missing keys:

{
  "overview": "<1-2 sentences summarising the full trip>",
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
    "roadConditions": "<road condition note if any day has fuelWarning mentioning dirt/gravel/unsealed, otherwise null>"
  },
  "generatedAt": "<ISO timestamp>"
}

STRICT RULES — violation will break the app:
1. STOP ENFORCEMENT: suggestedStay.name MUST be an exact value from that day's allowedStopNames array. If allowedStopNames is empty, set suggestedStay to null. NEVER invent a stop name not in allowedStopNames.
2. FUEL: populate fuelNote and tripNotes.fuelGuidance from the fuelCritical / gapFromLastFuelKm / gapToNextFuelKm / fuelWarning fields provided. Do not invent fuel information.
3. GAPS: if allowedStopNames is empty for a day, set suggestedStay to null and write a gapNote stating no overnight stop is available on that stretch.
4. VERIFIED CONTEXT: if verifiedStops is empty but allowedStopNames has values, do NOT claim the leg has no stop options.
5. OUTPUT: respond with ONLY the raw JSON object. No markdown fences, no explanation, no trailing text.`

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { tripId } = await params
    const { userId, trip, corridor, totalDistanceKm, fuelSummary, days } = await req.json()

    if (!tripId || !userId || !days?.length) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      )
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY })

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 2048,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Generate narrative for:\n\n${JSON.stringify(
            { trip, corridor, totalDistanceKm, fuelSummary, days },
            null,
            2
          )}\n\nRespond with ONLY the JSON object. Remember: suggestedStay.name must be an exact value from each day's allowedStopNames array.`,
        },
      ],
    })

    const raw = response.choices[0]?.message?.content?.trim() ?? ""

    let narrative
    try {
      narrative = JSON.parse(raw.replace(/^```[^\n]*\n?/, "").replace(/\n?```$/, ""))
    } catch {
      console.error("OpenAI returned non-JSON:", raw.slice(0, 500))
      return NextResponse.json(
        { success: false, error: "Failed to parse AI response" },
        { status: 500 }
      )
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
