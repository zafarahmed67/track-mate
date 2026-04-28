import { supabaseAdmin } from "@/config/supabase"
import { NextRequest, NextResponse } from "next/server"

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const normalizeStopId = (value: string): string => value.replace(/^custom-/, "")

/** A user-curated custom stop attached to a trip. The stop itself lives in
 *  the global `unverified_stops` cache; the trip<->stop link is in
 *  `trip_candidate_stops`. */

export async function GET(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 },
      )
    }

    const { searchParams } = new URL(req.url)
    const trip_id = searchParams.get("trip_id")
    if (!trip_id) {
      return NextResponse.json(
        { success: false, error: "trip_id is required" },
        { status: 400 },
      )
    }

    const { data, error } = await supabaseAdmin
      .from("trip_candidate_stops")
      .select(
        "id, day_index, day_order, is_selected, distance_from_start_km, unverified_stops:unverified_stops(id, place_id, location_name, latitude, longitude, address, place_type)",
      )
      .eq("trip_id", trip_id)
      .eq("source_type", "unverified")
      .order("day_index", { ascending: true })

    if (error) {
      console.error("Database error:", error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      )
    }

    const stops = (data ?? [])
      .map((row) => {
        const raw = row.unverified_stops as unknown as
          | {
              id: string
              place_id: string
              location_name: string
              latitude: number
              longitude: number
              address: string | null
              place_type: string | null
            }
          | Array<{
              id: string
              place_id: string
              location_name: string
              latitude: number
              longitude: number
              address: string | null
              place_type: string | null
            }>
          | null
        const us = Array.isArray(raw) ? raw[0] ?? null : raw
        if (!us) return null
        return {
          id: us.id,
          trip_id,
          location_name: us.location_name,
          latitude: String(us.latitude),
          longitude: String(us.longitude),
          address: us.address,
          place_type: us.place_type,
          day_index: row.day_index,
          distance_from_start_km: row.distance_from_start_km,
        }
      })
      .filter(Boolean)

    return NextResponse.json({ success: true, stops })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 },
      )
    }

    const body = await req.json()
    const {
      trip_id,
      user_id,
      place_id,
      location_name,
      latitude,
      longitude,
      address,
      place_type,
      day_index,
    } = body

    if (!trip_id || !user_id || !location_name || !latitude || !longitude) {
      return NextResponse.json(
        {
          success: false,
          error:
            "trip_id, user_id, location_name, latitude, and longitude are required",
        },
        { status: 400 },
      )
    }

    // Verify trip belongs to this user.
    const { data: trip } = await supabaseAdmin
      .from("trips")
      .select("id")
      .eq("id", trip_id)
      .eq("user_id", user_id)
      .single()
    if (!trip) {
      return NextResponse.json(
        { success: false, error: "Trip not found" },
        { status: 404 },
      )
    }

    const lat = Number(latitude)
    const lng = Number(longitude)
    const stablePlaceId =
      typeof place_id === "string" && place_id.length > 0
        ? place_id
        : `manual:${trip_id}:${location_name.toLowerCase().trim()}|${lat.toFixed(5)}|${lng.toFixed(5)}`

    // Upsert the stop into the global cache.
    const { data: cached, error: upsertError } = await supabaseAdmin
      .from("unverified_stops")
      .upsert(
        {
          place_id: stablePlaceId,
          location_name,
          latitude: lat,
          longitude: lng,
          address: address ?? null,
          place_type: place_type ?? null,
          source: typeof place_id === "string" ? "google_places" : "user_added",
          first_seen_trip_id: trip_id,
        },
        { onConflict: "place_id" },
      )
      .select("id, place_id, location_name, latitude, longitude, address, place_type")
      .single()

    if (upsertError || !cached) {
      console.error("Database error:", upsertError)
      return NextResponse.json(
        { success: false, error: upsertError?.message ?? "Failed to save stop" },
        { status: 500 },
      )
    }

    // Link this trip to the cached stop.
    const { error: linkError } = await supabaseAdmin
      .from("trip_candidate_stops")
      .upsert(
        {
          trip_id,
          stop_id: null,
          unverified_stop_id: cached.id,
          source_type: "unverified",
          day_index: typeof day_index === "number" ? day_index : 0,
          day_order: 1,
          is_selected: false,
        },
        { onConflict: "trip_id,unverified_stop_id", ignoreDuplicates: false },
      )

    if (linkError) {
      console.error("Link error:", linkError)
      return NextResponse.json(
        { success: false, error: linkError.message },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      stop: {
        id: cached.id,
        trip_id,
        location_name: cached.location_name,
        latitude: String(cached.latitude),
        longitude: String(cached.longitude),
        address: cached.address,
        place_type: cached.place_type,
        day_index: typeof day_index === "number" ? day_index : 0,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 },
      )
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    const trip_id = searchParams.get("trip_id")
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Stop ID is required" },
        { status: 400 },
      )
    }

    const normalizedId = normalizeStopId(id)
    if (!UUID_REGEX.test(normalizedId)) {
      return NextResponse.json(
        { success: false, error: "Invalid stop id" },
        { status: 400 },
      )
    }

    // Remove the trip<->stop link only — the stop itself stays in the global
    // cache so other trips can reuse it.
    let query = supabaseAdmin
      .from("trip_candidate_stops")
      .delete({ count: "exact" })
      .eq("unverified_stop_id", normalizedId)
    if (trip_id) query = query.eq("trip_id", trip_id)

    const { count, error } = await query

    if (error) {
      console.error("Database error:", error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      )
    }
    if (!count) {
      return NextResponse.json(
        { success: false, error: "Custom stop not found on this trip" },
        { status: 404 },
      )
    }

    return NextResponse.json({ success: true, message: "Custom stop removed" })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
