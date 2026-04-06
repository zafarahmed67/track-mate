import { supabaseAdmin } from "@/config/supabase"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const accessToken = url.searchParams.get("access_token")
  const type = url.searchParams.get("type")

  if (type === "magiclink" && accessToken) {
    return NextResponse.redirect(new URL("/auth/callback", req.url))
  }

  return NextResponse.redirect(new URL("/login", req.url))
}

export async function POST(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
      )
    }

    const { email, userId } = await req.json()

    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 }
      )
    }

    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin
      .from("users")
      .select("id, role, access_status")
      .eq("email", email)
      .single()

    if (existingUser) {
      await supabaseAdmin
        .from("users")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", existingUser.id)

      return NextResponse.json({
        success: true,
        message: "User updated",
        userId: existingUser.id,
        role: existingUser.role ?? "customer",
        access_status: existingUser.access_status ?? "inactive",
      })
    }

    // Create new user — no purchase yet so access is inactive until webhook fires
    const { data: newUser, error: insertError } = await supabaseAdmin
      .from("users")
      .insert({
        id: userId || crypto.randomUUID(),
        email: email,
        role: "customer",
        access_status: "inactive",
        created_at: new Date().toISOString(),
      })
      .select("id, role, access_status")
      .single()

    if (insertError) {
      console.error("Error creating user:", insertError)
      return NextResponse.json(
        { success: false, error: insertError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "User created",
      userId: newUser?.id,
      role: newUser?.role ?? "customer",
      access_status: newUser?.access_status ?? "inactive",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("Auth callback error:", message)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
