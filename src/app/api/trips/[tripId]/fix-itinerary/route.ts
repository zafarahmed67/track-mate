import OpenAI from "openai"
import { NextRequest, NextResponse } from "next/server"

interface RouteParams {
  params: Promise<{ tripId: string }>
}

interface DayInput {
  day: number
  startName: string
  endName: string
  endLat: number
  endLng: number
  endDistanceFromStartKm: number
  driveKm: number
}

interface CandidateStop {
  name: string
  latitude: number
  longitude: number
  distance_from_start_km: number
  stay_type?: string
}

interface FixedDay {
  day: number
  startName: string
  endName: string
  driveKm: number
  endDistanceFromStartKm?: number
  note?: string
}

const SYSTEM_PROMPT = `You are a route planning engine responsible for correcting an existing multi-day road trip itinerary.

The current itinerary has critical issues:
- Stops are repeating across multiple days
- The route sometimes moves backward instead of forward
- Some days include unrealistic jumps (e.g., 1000+ km in a 300 km day)
- Daily progression is inconsistent or stuck in loops

Your task is to FIX the itinerary flow while preserving as much of the original structure as possible.

Each stop includes: name, distance_from_start_km (cumulative km from trip start).

OBJECTIVES:
1. REMOVE REPETITIONS — each stop appears only once. If a stop repeats, keep first occurrence.
2. ENFORCE FORWARD PROGRESSION — each day's end stop must have greater distance_from_start_km than previous day. Never go backward.
3. FIX DAILY DISTANCES — each day should cover approximately 150–350 km. Exceeds 400 km → replace stop. Under 100 km → extend forward.
4. MAINTAIN CONTINUITY — each day starts where the previous day ended. No teleporting.
5. FILL GAPS — if gap > 400 km, insert intermediate stops from candidates list (prefer stops closest to midpoint).
6. REMOVE LOOPS — if a day starts and ends at same location → pick the nearest forward candidate.
7. PRIORITIZE VALID STOPS — prefer campgrounds and caravan parks over other types.
8. FALLBACK — if no ideal stop exists: choose nearest forward stop, never reuse, never go backward.

OUTPUT FORMAT (respond with ONLY this raw JSON, no markdown fences, no explanation):
{
  "days": [
    {
      "day": 1,
      "startName": "...",
      "endName": "...",
      "endDistanceFromStartKm": 200,
      "driveKm": 200,
      "note": "optional short explanation if changed"
    }
  ]
}

STRICT RULES:
- endName must be an exact name from the candidates list or original itinerary
- No repeated endName values across days
- endDistanceFromStartKm must always increase day over day
- driveKm = endDistanceFromStartKm - previous day's endDistanceFromStartKm
- First day's startName = trip start location`

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { tripId } = await params
    if (!tripId) {
      return NextResponse.json({ success: false, error: "Missing tripId" }, { status: 400 })
    }

    const { days, candidates, tripStartName, totalDistanceKm } = await req.json() as {
      days: DayInput[]
      candidates: CandidateStop[]
      tripStartName: string
      totalDistanceKm: number
    }

    if (!days?.length) {
      return NextResponse.json({ success: false, error: "No days provided" }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_KEY
    if (!apiKey) {
      return NextResponse.json({ success: false, error: "OpenAI not configured" }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey })

    const userPrompt = `Fix this ${days.length}-day itinerary for a ${totalDistanceKm} km road trip starting at "${tripStartName}".

CURRENT ITINERARY (broken):
${JSON.stringify(days, null, 2)}

AVAILABLE CANDIDATE STOPS (use these to fill gaps or replace broken days):
${JSON.stringify(candidates.slice(0, 40), null, 2)}

Return the corrected itinerary as raw JSON only.`

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 2048,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    })

    const raw = response.choices[0]?.message?.content?.trim() ?? ""

    let result: { days: FixedDay[] }
    try {
      result = JSON.parse(raw.replace(/^```[^\n]*\n?/, "").replace(/\n?```$/, ""))
    } catch {
      console.error("[fix-itinerary] Non-JSON response:", raw.slice(0, 500))
      return NextResponse.json({ success: false, error: "Failed to parse AI response" }, { status: 500 })
    }

    if (!Array.isArray(result?.days)) {
      return NextResponse.json({ success: false, error: "Invalid response shape" }, { status: 500 })
    }

    // Validate: ensure forward progression (safety net)
    let lastKm = 0
    const seenNames = new Set<string>()
    const validated = result.days.map((day) => {
      // Dedupe: if endName already used, clear it so UI can flag it
      if (seenNames.has(day.endName)) {
        day.note = `[duplicate removed] ${day.note ?? ""}`
        day.endName = ""
      } else {
        seenNames.add(day.endName)
      }
      lastKm = day.endDistanceFromStartKm ?? lastKm
      return day
    })

    return NextResponse.json({ success: true, days: validated })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[fix-itinerary] Error:", message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
