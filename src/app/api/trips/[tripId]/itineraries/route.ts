import { supabaseAdmin } from "@/config/supabase"
import { generateNarrativeForTrip } from "@/utils/generateItineraryNarrative"
import { NextRequest, NextResponse } from "next/server"

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
      .select("id, version, status, created_at, itinerary_json")
      .eq("trip_id", tripId)
      .order("version", { ascending: false })

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const totalVersions = (itineraries ?? []).map((itinerary) => `v${itinerary.version}`)
    const activeItinerary = itineraries?.find((itinerary) => itinerary.status === "active") ?? null
    const activeVersion = activeItinerary ? `v${activeItinerary.version}` : null
    const itineraryRows = (itineraries ?? []).map((itinerary) => ({
      id: itinerary.id,
      version: itinerary.version,
      status: itinerary.status,
      model_name: null,
      created_at: itinerary.created_at,
    }))

    return NextResponse.json({
      success: true,
      totalVersions,
      activeVersion,
      data: activeItinerary?.itinerary_json ?? {},
      itineraries: itineraryRows,
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
      .select("id")
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

    return NextResponse.json({ success: true, narrative: targetItinerary.itinerary_json })
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
    const { userId } = await req.json()

    if (!tripId || !userId) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
    }

    let result
    try {
      result = await generateNarrativeForTrip(tripId, userId)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      if (message === "Trip not found") return NextResponse.json({ success: false, error: message }, { status: 404 })
      if (message === "No itinerary day data found for this trip") return NextResponse.json({ success: false, error: message }, { status: 409 })
      throw err
    }

    const { narrative, days, trip, corridor, totalDistanceKm } = result

    // Get next version number
    const { data: existingVersions } = await supabaseAdmin
      .from("trip_itineraries")
      .select("version")
      .eq("trip_id", tripId)
      .order("version", { ascending: false })
      .limit(1)

    const nextVersion = existingVersions?.[0]?.version ? existingVersions[0].version + 1 : 1

    // Mark previous active itineraries as superseded
    await supabaseAdmin
      .from("trip_itineraries")
      .update({ status: "superseded" })
      .eq("trip_id", tripId)
      .eq("status", "active")

    // Insert new itinerary record (no stops_by_day_json — that lives on
    // trip_candidate_stops and is reconstructed on read).
    const { data: itineraryRecord, error: itineraryError } = await supabaseAdmin
      .from("trip_itineraries")
      .insert({
        trip_id: tripId,
        version: nextVersion,
        status: "active",
        trip_snapshot_json: { trip, corridor, totalDistanceKm, days },
        itinerary_json: narrative,
      })
      .select("id")
      .single()

    if (!itineraryError && itineraryRecord) {
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
        }
      })
      await supabaseAdmin.from("itinerary_days").insert(dayRows)
    }

    // Narrative lives only on trip_itineraries.itinerary_json (no duplication
    // into trips.route_data_json).
    return NextResponse.json({ success: true, narrative })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
