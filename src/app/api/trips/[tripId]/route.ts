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
      .from("trips")
      .select("*")
      .eq("id", tripId)
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

    if (!tripId) {
      return NextResponse.json(
        { success: false, error: "trip_id is required" },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from("trips")
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tripId)
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
