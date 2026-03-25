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
    const trip_id = searchParams.get("trip_id")

    if (!trip_id) {
      return NextResponse.json(
        { success: false, error: "trip_id is required" },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from("custom_stops")
      .select("*")
      .eq("trip_id", trip_id)
      .order("day_index", { ascending: true })

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

export async function POST(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
      )
    }

    const body = await req.json()
    const { trip_id, location_name, latitude, longitude, address, place_type, day_index } = body

    if (!trip_id || !location_name || !latitude || !longitude) {
      return NextResponse.json(
        { success: false, error: "trip_id, location_name, latitude, and longitude are required" },
        { status: 400 }
      )
    }

    const { data: existing } = await supabaseAdmin
      .from("custom_stops")
      .select("id")
      .eq("trip_id", trip_id)
      .eq("location_name", location_name)
      .single()

    if (existing) {
      return NextResponse.json(
        { success: false, error: "This place is already in your trip" },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from("custom_stops")
      .insert({
        trip_id,
        location_name,
        latitude: latitude.toString(),
        longitude: longitude.toString(),
        address,
        place_type,
        day_index: day_index ?? 0,
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
      stop: data,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
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
      .from("custom_stops")
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
      message: "Custom stop removed",
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
