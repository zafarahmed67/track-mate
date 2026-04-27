import { supabaseAdmin } from "@/config/supabase"
import { NextRequest, NextResponse } from "next/server"
import { getTripStopsByDay } from "@/lib/tripStopsRepo"

interface RouteParams {
  params: Promise<{ tripId: string }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
      )
    }

    const { tripId } = await params
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get("user_id")

    if (!tripId || !userId) {
      return NextResponse.json(
        { success: false, error: "trip_id and user_id are required" },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from("trips")
      .select("*")
      .eq("id", tripId)
      .eq("user_id", userId)
      .single()

    if (error) {
      console.error("Database error:", error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    // Pull the latest active itinerary (narrative + version metadata).
    const { data: itineraryRows } = await supabaseAdmin
      .from("trip_itineraries")
      .select("id, version, status, itinerary_json, trip_snapshot_json, created_at")
      .eq("trip_id", tripId)
      .order("version", { ascending: false })

    // Build per-day stop options from trip_candidate_stops (single source of
    // truth). Shape it as legacy stops_by_day_json so the planner UI keeps
    // working without a UI rewrite. Map "unverified" -> "custom" for legacy
    // sourceType naming.
    const stopsByDay = await getTripStopsByDay(tripId)
    const stopsByDayJson: Record<string, unknown> = {}
    for (const [dayKey, opts] of Object.entries(stopsByDay)) {
      stopsByDayJson[dayKey] = opts.map((o) => ({
        id: o.id,
        name: o.name,
        latitude: o.latitude,
        longitude: o.longitude,
        distance_from_start_km: o.distance_from_start_km,
        sourceType: o.sourceType === "verified" ? "verified" : "custom",
        isSelected: o.isSelected,
        dayOrder: o.dayOrder,
      }))
    }

    // Fold any persisted fuelByDay (now stored on route_data_json) into the
    // synthesized JSON so the planner's existing read path picks it up.
    const routeDataJson = (data?.route_data_json as Record<string, unknown> | null) ?? {}
    if (routeDataJson.fuelByDay && typeof routeDataJson.fuelByDay === "object") {
      stopsByDayJson.fuelByDay = routeDataJson.fuelByDay
    }

    const stopsResponse = (itineraryRows ?? []).map((row) => ({
      ...row,
      stops_by_day_json: row.status === "active" ? stopsByDayJson : {},
    }))

    return NextResponse.json({
      success: true,
      trip: data,
      stops: stopsResponse,
      stopsByDay,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
      )
    }

    const { tripId } = await params
    const body = await req.json()
    const { userId, ...fields } = body

    if (!tripId || !userId) {
      return NextResponse.json(
        { success: false, error: "trip_id and userId are required" },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from("trips")
      .update({
        ...fields,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tripId)
      .eq("user_id", userId)
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

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
      )
    }

    const { tripId } = await params
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get("user_id")

    if (!tripId || !userId) {
      return NextResponse.json(
        { success: false, error: "trip_id and user_id are required" },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin
      .from("trips")
      .delete()
      .eq("id", tripId)
      .eq("user_id", userId)

    if (error) {
      console.error("Database error:", error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Trip deleted successfully",
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
