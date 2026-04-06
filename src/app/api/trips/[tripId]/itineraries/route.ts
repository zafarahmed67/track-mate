import { supabaseAdmin } from "@/config/supabase"
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
