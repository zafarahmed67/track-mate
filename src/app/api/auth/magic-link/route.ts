import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 }
      )
    }

    // Generate magic link
    const { data: magicLinkData, error: magicLinkError } = await supabaseAdmin.auth.admin.generateLink({
      email,
      type: "magiclink",
    })

    if (magicLinkError) {
      console.error("Error generating magic link:", magicLinkError)
      return NextResponse.json(
        { success: false, error: magicLinkError.message },
        { status: 500 }
      )
    }

    const magicLink = magicLinkData.properties.action_link

    // Log for debugging (in production, the magic link is sent via Supabase email)
    console.log("Magic link generated for:", email)
    console.log("Magic link:", magicLink)

    return NextResponse.json({
      success: true,
      message: "Magic link sent to your email",
      magicLink
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("Login error:", message)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
