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
