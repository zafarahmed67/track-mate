import { supabaseAdmin } from "@/config/supabase"
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/server-auth"
import { logAdminAction } from "@/lib/audit-log"

/**
 * Admin review surface for the global Places cache. Each row is a stop that a
 * trip generation pass discovered via Google Places. Promote good ones into
 * the curated `stops` table, edit/correct as needed, or bulk-delete bad
 * entries to keep the cache clean.
 */
export async function GET(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin()
    if ("error" in adminCheck) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status })
    }
    const adminUserId = adminCheck.user.id as string
    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (id) {
      const { data, error } = await supabaseAdmin
        .from("unverified_stops")
        .select("*")
        .eq("id", id)
        .single()
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, stop: data })
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "50"))
    const search = searchParams.get("search") || ""
    const state = searchParams.get("state") || ""
    const status = searchParams.get("status") || ""
    const offset = (page - 1) * limit

    let query = supabaseAdmin
      .from("unverified_stops")
      .select(
        "id, place_id, location_name, state, region, address, place_type, rating, user_ratings_total, review_status, hit_count, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (search) query = query.ilike("location_name", `%${search}%`)
    if (state) query = query.eq("state", state)
    if (status) query = query.eq("review_status", status)

    const { data, error, count } = await query
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    return NextResponse.json({
      success: true,
      stops: data ?? [],
      total: count ?? 0,
      page,
      limit,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/** Edit an unverified stop's editable fields. */
export async function PATCH(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin()
    if ("error" in adminCheck) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status })
    }
    const adminUserId = adminCheck.user.id as string
    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const body = await req.json()
    const { id, ...fields } = body
    if (!id) {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 })
    }

    const editable: Record<string, unknown> = {}
    for (const k of [
      "location_name",
      "state",
      "region",
      "address",
      "place_type",
      "latitude",
      "longitude",
      "review_status",
    ]) {
      if (k in fields) editable[k] = fields[k]
    }
    editable.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from("unverified_stops")
      .update(editable)
      .eq("id", id)
      .select()
      .single()

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    await logAdminAction(adminUserId, "unverified_stop.edit", "unverified_stop", id, {
      fields: Object.keys(editable),
    })
    return NextResponse.json({ success: true, stop: data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/** Bulk delete: ?ids=a,b,c — or single ?id=foo. */
export async function DELETE(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin()
    if ("error" in adminCheck) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status })
    }
    const adminUserId = adminCheck.user.id as string
    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const { searchParams } = new URL(req.url)
    const idsParam = searchParams.get("ids")
    const id = searchParams.get("id")
    const ids = idsParam ? idsParam.split(",").filter(Boolean) : id ? [id] : []
    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: "ids or id is required" }, { status: 400 })
    }

    const { error, count } = await supabaseAdmin
      .from("unverified_stops")
      .delete({ count: "exact" })
      .in("id", ids)

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    await logAdminAction(adminUserId, "unverified_stop.delete", "unverified_stop", null, {
      count: count ?? 0,
      ids,
    })
    return NextResponse.json({ success: true, deleted: count ?? 0 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/** Promote: copy unverified -> stops (verification_status='AAO Verified'),
 *  mark unverified as review_status='promoted'. */
export async function POST(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin()
    if ("error" in adminCheck) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status })
    }
    const adminUserId = adminCheck.user.id as string
    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const body = await req.json()
    const { id, overrides } = body as { id: string; overrides?: Record<string, unknown> }
    if (!id) {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 })
    }

    const { data: src, error: srcError } = await supabaseAdmin
      .from("unverified_stops")
      .select("*")
      .eq("id", id)
      .single()

    if (srcError || !src) {
      return NextResponse.json({ success: false, error: srcError?.message ?? "Not found" }, { status: 404 })
    }

    const { verification_status: overrideStatus, ...overrideFields } = overrides ?? {}
    const normalizedStatus =
      overrideStatus === "verified"
        ? "AAO Verified"
        : typeof overrideStatus === "string"
          ? overrideStatus
          : "AAO Verified"

    const stopRow: Record<string, unknown> = {
      location_name: src.location_name,
      state: src.state ?? "",
      region: src.region ?? "",
      latitude: String(src.latitude),
      longitude: String(src.longitude),
      ...overrideFields,
      verification_status: normalizedStatus,
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("stops")
      .insert(stopRow)
      .select("id")
      .single()
    if (insertError || !inserted) {
      return NextResponse.json({ success: false, error: insertError?.message ?? "Insert failed" }, { status: 500 })
    }

    await supabaseAdmin
      .from("unverified_stops")
      .update({ review_status: "promoted", updated_at: new Date().toISOString() })
      .eq("id", id)

    await logAdminAction(adminUserId, "unverified_stop.promote", "stop", inserted.id, {
      unverifiedId: id,
    })
    return NextResponse.json({ success: true, stopId: inserted.id })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
