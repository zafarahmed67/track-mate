import { supabaseAdmin } from "@/config/supabase"
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/server-auth"

export async function GET() {
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

    const [stopsResult, usersResult, auditResult, unverifiedResult] = await Promise.all([
      supabaseAdmin
        .from("stops")
        .select("verification_status", { count: "exact" }),
      supabaseAdmin
        .from("users")
        .select("id", { count: "exact" }),
      supabaseAdmin
        .from("admin_audit_logs")
        .select("id,action,entity_type,entity_id,created_at")
        .order("created_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("unverified_stops")
        .select("id", { count: "exact", head: true })
        .eq("review_status", "pending"),
    ])

    const stops = stopsResult.data ?? []
    const totalStops = stopsResult.count ?? 0
    const totalUsers = usersResult.count ?? 0
    const pendingUnverifiedStops = unverifiedResult.count ?? 0

    const byStatus = stops.reduce<Record<string, number>>((acc, s) => {
      const key = s.verification_status ?? "unknown"
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {})

    return NextResponse.json({
      success: true,
      totalStops,
      totalUsers,
      stopsByStatus: byStatus,
      pendingUnverifiedStops,
      recentAuditLog: auditResult.data ?? [],
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
