import { supabaseAdmin } from "@/config/supabase"
import { NextRequest, NextResponse } from "next/server"

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
      id,
      location_name,
      latitude,
      longitude,
      state,
      nearest_town = "",
      region = "",
      route_type = "",
      rig_suitability = "",
      access_type = "",
      water = "",
      dump_point = "",
      pet_friendly = "",
      best_season = "",
      stay_type = "",
      why_we_d_stay_again = "",
      confidence_level = "",
      tier = "",
      aao_tip = "",
      why_stop_here = "",
      best_travel_window = "",
      corridor = "",
      road_suitability = "",
      max_rig_length = "",
      cost_band = "",
      verification_status = "custom",
    } = body

    if (!id || !location_name || !latitude || !longitude) {
      return NextResponse.json(
        { success: false, error: "id, location_name, latitude, and longitude are required" },
        { status: 400 }
      )
    }

    const { data: existingStop } = await supabaseAdmin
      .from("stops")
      .select("id")
      .eq("id", id)
      .single()

    let data, error

    if (existingStop) {
      const result = await supabaseAdmin
        .from("stops")
        .update({
          location_name,
          latitude,
          longitude,
          state,
          nearest_town,
          region,
          route_type,
          rig_suitability,
          access_type,
          water,
          dump_point,
          pet_friendly,
          best_season,
          stay_type,
          why_we_d_stay_again,
          confidence_level,
          tier,
          aao_tip,
          why_stop_here,
          best_travel_window,
          corridor,
          road_suitability,
          max_rig_length,
          cost_band,
          verification_status,
        })
        .eq("id", id)
        .select()
        .single()
      data = result.data
      error = result.error
    } else {
      const result = await supabaseAdmin
        .from("stops")
        .insert({
          id,
          location_name,
          latitude,
          longitude,
          state,
          nearest_town,
          region,
          route_type,
          rig_suitability,
          access_type,
          water,
          dump_point,
          pet_friendly,
          best_season,
          stay_type,
          why_we_d_stay_again,
          confidence_level,
          tier,
          aao_tip,
          why_stop_here,
          best_travel_window,
          corridor,
          road_suitability,
          max_rig_length,
          cost_band,
          verification_status,
        })
        .select()
        .single()
      data = result.data
      error = result.error
    }

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
