import { supabaseAdmin } from "../../../config/supabase"
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

    const { name, email, phone } = body

    if (!email || !name) {
      return NextResponse.json(
        { success: false, error: "Name and email are required" },
        { status: 400 }
      )
    }

    const nameParts = name.trim().split(" ")
    const firstName = nameParts[0] || null
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null

    const { data: existingUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("email", email)
      .single()

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: "User with this email already exists" },
        { status: 409 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from("users")
      .insert({
        email,
        first_name: firstName,
        last_name: lastName,
        password_hash: "funnel_lead_" + Date.now(),
        role: "customer",
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

    console.log("New user from funnel:", name, email, phone, "User ID:", data?.id)

    return NextResponse.json({
      success: true,
      message: "User created successfully",
      userId: data?.id,
    })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}