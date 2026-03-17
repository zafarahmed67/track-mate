import { supabaseAdmin } from "@/config/supabase"
import { NextRequest, NextResponse } from "next/server"

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

    if (!tripId) {
      return NextResponse.json(
        { success: false, error: "trip_id is required" },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from("trip_candidate_stops")
      .select(`
        *,
        stop:stops(*)
      `)
      .eq("trip_id", tripId)
      .order("rank_score", { ascending: false })

    if (error) {
      console.error("Database error:", error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      stops: data,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
      )
    }

    const { tripId } = await params
    const body = await req.json()
    const { stop_ids, selected_by_ai = false } = body

    if (!tripId || !stop_ids || !Array.isArray(stop_ids)) {
      return NextResponse.json(
        { success: false, error: "trip_id and stop_ids array are required" },
        { status: 400 }
      )
    }

    const stopsToInsert = stop_ids.map((stopId: string) => ({
      trip_id: tripId,
      stop_id: stopId,
      selected_by_ai,
      generation_version: 1,
    }))

    const { data, error } = await supabaseAdmin
      .from("trip_candidate_stops")
      .upsert(stopsToInsert, {
        onConflict: "trip_id,stop_id",
      })
      .select()

    if (error) {
      console.error("Database error:", error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Stops added to trip",
      data,
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

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Stop ID is required" },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin
      .from("trip_candidate_stops")
      .delete()
      .eq("id", id)

    if (error) {
      console.error("Database error:", error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Stop removed from trip",
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
