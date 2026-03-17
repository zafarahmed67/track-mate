import { supabaseAdmin } from "@/config/supabase"
import { NextRequest, NextResponse } from "next/server"

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

    if (!title || !startLocation || !destination || !tripDurationDays) {
      return NextResponse.json(
        { success: false, error: "Title, start location, destination, and duration are required" },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from("trips")
      .insert({
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
        status: status,
        planner_input_json: body,
        route_data_json: {},
      })
      .select()
      .single()

    if (error) {
      console.error("Database error:", error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      tripId: data?.id,
      trip: data,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
