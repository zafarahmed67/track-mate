import { supabaseAdmin } from "@/config/supabase"
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/server-auth"
import { logAdminAction } from "@/lib/audit-log"

export async function GET(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin()
    if ("error" in adminCheck) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status })
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
      )
    }

    const { searchParams } = new URL(req.url)

    // Single-stop fetch for edit form
    const id = searchParams.get("id")
    const full = searchParams.get("full")
    if (id && full) {
      const { data, error } = await supabaseAdmin.from("stops").select("*").eq("id", id).single()
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, stop: data })
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "50"))
    const search = searchParams.get("search") || ""
    const state = searchParams.get("state") || ""
    const offset = (page - 1) * limit

    let query = supabaseAdmin
      .from("stops")
      .select("id,location_name,state,nearest_town,stay_type,verification_status,cost_band,pet_friendly,created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (search) {
      query = query.ilike("location_name", `%${search}%`)
    }

    if (state) {
      query = query.eq("state", state)
    }

    const { data: stops, error, count } = await query

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      stops: stops ?? [],
      total: count ?? 0,
      page,
      limit,
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
    const adminCheck = await requireAdmin()
    if ("error" in adminCheck) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status })
    }
    const adminUser = adminCheck.user

    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
      )
    }

    const body = await req.json()

    if (!body.location_name || !body.latitude || !body.longitude) {
      return NextResponse.json(
        { success: false, error: "location_name, latitude, and longitude are required" },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from("stops")
      .insert({
        location_name: body.location_name,
        state: body.state ?? null,
        region: body.region ?? null,
        nearest_town: body.nearest_town ?? null,
        route_type: body.route_type ?? null,
        rig_suitability: body.rig_suitability ?? null,
        access_type: body.access_type ?? null,
        water: body.water ?? null,
        dump_point: body.dump_point ?? null,
        pet_friendly: body.pet_friendly ?? null,
        best_season: body.best_season ?? null,
        stay_type: body.stay_type ?? null,
        why_we_d_stay_again: body.why_we_d_stay_again ?? null,
        confidence_level: body.confidence_level ?? null,
        tier: body.tier ?? null,
        aao_tip: body.aao_tip ?? null,
        why_stop_here: body.why_stop_here ?? null,
        best_travel_window: body.best_travel_window ?? null,
        latitude: body.latitude,
        longitude: body.longitude,
        corridor: body.corridor ?? null,
        road_suitability: body.road_suitability ?? null,
        max_rig_length: body.max_rig_length ?? null,
        cost_band: body.cost_band ?? null,
        verification_status: body.verification_status ?? "unverified",
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    await logAdminAction(adminUser.id, "stop_created", "stop", data.id, {
      location_name: data.location_name,
      state: data.state,
    })

    return NextResponse.json({ success: true, stop: data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin()
    if ("error" in adminCheck) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status })
    }
    const adminUser = adminCheck.user

    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
      )
    }

    const body = await req.json()

    if (!body.id) {
      return NextResponse.json(
        { success: false, error: "id is required" },
        { status: 400 }
      )
    }

    const { id, ...fields } = body

    const { data, error } = await supabaseAdmin
      .from("stops")
      .update(fields)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    await logAdminAction(adminUser.id, "stop_updated", "stop", id, {
      location_name: data.location_name,
      changed_fields: Object.keys(fields),
    })

    return NextResponse.json({ success: true, stop: data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin()
    if ("error" in adminCheck) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status })
    }
    const adminUser = adminCheck.user

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
        { success: false, error: "id is required" },
        { status: 400 }
      )
    }

    const { data: stopBeforeDelete } = await supabaseAdmin
      .from("stops")
      .select("location_name")
      .eq("id", id)
      .single()

    const { error } = await supabaseAdmin.from("stops").delete().eq("id", id)

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    await logAdminAction(adminUser.id, "stop_deleted", "stop", id, {
      location_name: stopBeforeDelete?.location_name,
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
