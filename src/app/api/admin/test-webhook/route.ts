import { supabaseAdmin } from "@/config/supabase"
import { NextRequest, NextResponse } from "next/server"

// POST /api/admin/test-webhook
// Admin-only endpoint that fires a fake purchase payload at the real webhook endpoint.
// This lets admins validate the full signup → magic-link flow without a real payment.
export async function POST(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const { adminUserId, email, firstName, lastName, orderId } = await req.json()

    if (!adminUserId || !email) {
      return NextResponse.json({ success: false, error: "adminUserId and email are required" }, { status: 400 })
    }

    // Verify the caller is an admin
    const { data: adminUser } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", adminUserId)
      .single()

    if (adminUser?.role !== "admin") {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const webhookSecret = process.env.WEBHOOK_SECRET
    if (!webhookSecret) {
      return NextResponse.json({ success: false, error: "WEBHOOK_SECRET not configured" }, { status: 500 })
    }

    // Build a realistic fake Fab Funnels payload
    const fakeOrderId = orderId || `TEST-${Date.now()}`
    const fakePayload = {
      email,
      first_name: firstName || "Test",
      last_name: lastName || "User",
      full_name: `${firstName || "Test"} ${lastName || "User"}`,
      contactId: `test-contact-${fakeOrderId}`,
      id: fakeOrderId,
      order: {
        interProductId: fakeOrderId,
        productName: "TrackMate (Test Purchase)",
        amount: 0,
        currency: "AUD",
        submissionType: "Sale",
      },
      workflow: {
        id: "test-workflow",
        name: "TrackMate Test Purchase",
      },
    }

    // Call the real webhook endpoint internally
    const baseUrl = req.nextUrl.origin
    const webhookResponse = await fetch(`${baseUrl}/api/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": webhookSecret,
      },
      body: JSON.stringify(fakePayload),
    })

    const webhookResult = await webhookResponse.json()

    return NextResponse.json({
      success: true,
      testOrderId: fakeOrderId,
      webhookStatus: webhookResponse.status,
      webhookResult,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
