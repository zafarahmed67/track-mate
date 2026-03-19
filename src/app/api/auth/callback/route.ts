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
      .select("*")
      .eq("email", email)
      .single()

    if (existingUser) {
      // Update existing user
      const { error: updateError } = await supabaseAdmin
        .from("users")
        .update({
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingUser.id)

      if (updateError) {
        console.error("Error updating user:", updateError)
      }

      return NextResponse.json({
        success: true,
        message: "User updated",
        userId: existingUser.id,
      })
    }

    // Create new user
    const { data: newUser, error: insertError } = await supabaseAdmin
      .from("users")
      .insert({
        id: userId || crypto.randomUUID(),
        email: email,
        role: "customer",
        created_at: new Date().toISOString(),
      })
      .select()
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
