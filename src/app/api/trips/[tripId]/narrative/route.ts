import OpenAI from "openai"
import { NextRequest, NextResponse } from "next/server"

interface RouteParams {
  params: Promise<{ tripId: string }>
}

const SYSTEM_PROMPT = `You are a travel writing assistant for an Australian caravan/RV road trip planner called TrackMate.
Given structured data about a multi-day road trip, produce a JSON object with this exact shape:
{
  "overview": "<1-2 sentences summarising the full trip>",
  "days": [
    {
      "dayNumber": 1,
      "narrative": "<2-3 sentences describing what the day's drive is like — terrain, region highlights, character>",
      "aaoTips": ["<tip 1>", "<tip 2>"],
      "gapNote": "<short note if no verified stop or fuel concern, otherwise null>"
    }
  ],
  "generatedAt": "<ISO timestamp>"
}
Rules:
- aaoTips: draw from the provided aao_tip / why_stop_here / why_we_d_stay_again fields. If all are empty, return [].
- gapNote: if degradedMode is true OR verifiedStops is empty, write a 1-sentence planning caution. Otherwise null.
- narrative: write in the voice of a knowledgeable Australian road-trip guide — warm, practical, specific to the region.
- Respond with ONLY the raw JSON object. No markdown fences, no explanation.`

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { tripId } = await params
    const { userId, trip, corridor, totalDistanceKm, days } = await req.json()

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
            { trip, corridor, totalDistanceKm, days },
            null,
            2
          )}\n\nRespond with ONLY the JSON object.`,
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
    return NextResponse.json({ success: true, narrative })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
