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

    const { tripId } = await params
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!tripId || !id) {
      return NextResponse.json(
        { success: false, error: "trip_id and stop id are required" },
        { status: 400 }
      )
    }

    const { count, error } = await supabaseAdmin
      .from("trip_candidate_stops")
      .delete({ count: "exact" })
      .eq("trip_id", tripId)
      .or(`id.eq.${id},stop_id.eq.${id}`)

    if (error) {
      console.error("Database error:", error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    if (!count) {
      return NextResponse.json(
        { success: false, error: "Stop not found in this trip" },
        { status: 404 }
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
    const { stop_orders } = body

    if (!tripId || !stop_orders || !Array.isArray(stop_orders)) {
      return NextResponse.json(
        { success: false, error: "trip_id and stop_orders array are required" },
        { status: 400 }
      )
    }

    const updates = stop_orders.map((item: { id: string; rank_score: number }) => ({
      id: item.id,
      rank_score: item.rank_score,
    }))

    console.log("hello stops reorder request", {
      tripId,
      updatesCount: updates.length,
      updateIds: updates.map((item) => item.id),
    })

    const unmatchedIds: string[] = []

    for (const update of updates) {
      const { data, error } = await supabaseAdmin
        .from("trip_candidate_stops")
        .update({ rank_score: update.rank_score })
        .eq("trip_id", tripId)
        .or(`id.eq.${update.id},stop_id.eq.${update.id}`)
        .select("id")

      if (error) {
        console.error("Database error:", error)
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        )
      }

      if (!data || data.length === 0) {
        unmatchedIds.push(update.id)
      }
    }

    if (unmatchedIds.length > 0) {
      console.warn("Reorder ids not found in trip_candidate_stops, attempting auto-insert", {
        tripId,
        unmatchedIds,
      })

      const rowsToInsert = unmatchedIds.map((stopId) => ({
        trip_id: tripId,
        stop_id: stopId,
        selected_by_ai: false,
        generation_version: 1,
      }))

      const { error: insertError } = await supabaseAdmin
        .from("trip_candidate_stops")
        .upsert(rowsToInsert, {
          onConflict: "trip_id,stop_id,generation_version",
        })

      if (insertError) {
        console.error("Failed to auto-insert unmatched stops for reorder", {
          tripId,
          unmatchedIds,
          error: insertError,
        })

        return NextResponse.json(
          {
            success: false,
            error: "Failed to add missing stops before reorder",
            unmatchedIds,
          },
          { status: 400 }
        )
      }

      const stillUnmatchedIds: string[] = []
      for (const update of updates) {
        const { data, error } = await supabaseAdmin
          .from("trip_candidate_stops")
          .update({ rank_score: update.rank_score })
          .eq("trip_id", tripId)
          .or(`id.eq.${update.id},stop_id.eq.${update.id}`)
          .select("id")

        if (error) {
          console.error("Database error during reorder retry:", error)
          return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
          )
        }

        if (!data || data.length === 0) {
          stillUnmatchedIds.push(update.id)
        }
      }

      if (stillUnmatchedIds.length > 0) {
        console.error("Reorder ids still unmatched after auto-insert", {
          tripId,
          stillUnmatchedIds,
        })

        return NextResponse.json(
          {
            success: false,
            error: "Some stop ids could not be matched for reorder",
            unmatchedIds: stillUnmatchedIds,
          },
          { status: 400 }
        )
      }

      console.log("hello stops reorder auto-inserted unmatched ids", {
        tripId,
        insertedIds: unmatchedIds,
      })
    }

    return NextResponse.json({
      success: true,
      message: "Stops reordered",
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
