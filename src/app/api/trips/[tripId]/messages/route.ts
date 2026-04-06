import OpenAI from "openai"
import { supabaseAdmin } from "@/config/supabase"
import { NextRequest, NextResponse } from "next/server"

interface RouteParams {
  params: Promise<{ tripId: string }>
}

const CHAT_SYSTEM_PROMPT = `You are TrackMate's AI trip assistant — a knowledgeable Australian caravan/RV road trip guide.
You help travellers refine and understand their trip itinerary. You have access to the trip's route details and AI-generated narrative.
Be warm, practical, and specific to Australian road travel.
Keep responses concise (2-4 sentences) unless a detailed answer is needed.
If asked to update the itinerary or add notes, acknowledge the request and suggest the user regenerate the narrative with any new context they provide.`

// Patterns that require re-filtering the stop database (major changes)
const MAJOR_CHANGE_PATTERNS = [
  /\bgravel\b/i,
  /\bno gravel\b/i,
  /\bavoid.*road/i,
  /\bpet.?friend/i,
  /\bno pets?\b/i,
  /\bfree.?camp/i,
  /\bcaravan park/i,
  /\bchange.*rig\b/i,
  /\bbigger rig\b/i,
  /\bsmaller rig\b/i,
  /\brig size\b/i,
  /\bchange.*stay\b/i,
  /\bdifferent stop/i,
  /\bdifferent route/i,
  /\bnew route\b/i,
  /\breplan\b/i,
  /\bre-plan\b/i,
  /\bonly.*verified\b/i,
  /\bprefer.*camp/i,
  /\bpowered site/i,
  /\bunpowered\b/i,
  /\bsealed road/i,
  /\bno dirt\b/i,
  /\bdirt road/i,
]

function classifyMessage(text: string): "minor" | "major" {
  return MAJOR_CHANGE_PATTERNS.some((re) => re.test(text)) ? "major" : "minor"
}

// Extract a plain-English hint about what preference changed
function extractPreferenceHint(text: string): string {
  if (/gravel|dirt.*road|sealed/i.test(text)) return "road surface preference"
  if (/pet.?friend|no pets?/i.test(text)) return "pet-friendly filter"
  if (/free.?camp/i.test(text)) return "free camping preference"
  if (/caravan park/i.test(text)) return "stay type (caravan park)"
  if (/rig/i.test(text)) return "rig suitability"
  if (/powered|unpowered/i.test(text)) return "site type (powered/unpowered)"
  return "stop preferences"
}

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

    const { data: messages, error } = await supabaseAdmin
      .from("trip_messages")
      .select("id, role, message_text, created_at")
      .eq("trip_id", tripId)
      .neq("role", "system")
      .order("created_at", { ascending: true })

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, messages: messages ?? [] })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const { tripId } = await params
    const { userId, message_text, tripContext } = await req.json()

    if (!tripId || !userId || !message_text?.trim()) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
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

    // Classify before saving — determines AI tone and response action
    const changeType = classifyMessage(message_text.trim())
    const preferenceHint = changeType === "major" ? extractPreferenceHint(message_text) : null

    // Save user message with classification metadata
    await supabaseAdmin.from("trip_messages").insert({
      trip_id: tripId,
      role: "user",
      message_text: message_text.trim(),
      message_json: { changeType, preferenceHint },
    })

    // Load recent conversation history (last 20 messages)
    const { data: history } = await supabaseAdmin
      .from("trip_messages")
      .select("role, message_text")
      .eq("trip_id", tripId)
      .neq("role", "system")
      .order("created_at", { ascending: false })
      .limit(20)

    const orderedHistory = (history ?? []).reverse()

    // Build system prompt — for major changes, instruct AI to acknowledge and guide the user
    const majorAddendum = changeType === "major"
      ? `\n\nThe user's message has been classified as a MAJOR change that requires different stops to be filtered from the database. Acknowledge their request warmly, confirm what preference you understood (${preferenceHint}), and tell them to use the "Edit Trip" button to update their trip preferences, then click "Rebuild plan" and "AI Narrative" to regenerate with the new stops. Do NOT try to invent or suggest specific stops yourself.`
      : ""

    const contextNote = tripContext
      ? `\n\nTrip context:\n${JSON.stringify(tripContext, null, 2)}`
      : ""

    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: CHAT_SYSTEM_PROMPT + contextNote + majorAddendum },
      ...orderedHistory.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.message_text ?? "",
      })),
    ]

    const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY })
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 512,
      messages: openaiMessages,
    })

    const assistantText = response.choices[0]?.message?.content?.trim() ?? "Sorry, I could not generate a response."

    // Save assistant response
    const { data: savedMessage } = await supabaseAdmin
      .from("trip_messages")
      .insert({
        trip_id: tripId,
        role: "assistant",
        message_text: assistantText,
        message_json: { replyTo: changeType },
      })
      .select("id, role, message_text, created_at")
      .single()

    // For major changes, return an action so the frontend can show a guidance banner
    const action = changeType === "major"
      ? { type: "refilter" as const, preferenceHint }
      : null

    return NextResponse.json({ success: true, message: savedMessage, action, changeType })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
