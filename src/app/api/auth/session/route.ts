import { NextRequest, NextResponse } from "next/server"

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export async function POST(req: NextRequest) {
  try {
    const { access_token, refresh_token, expires_at } = await req.json()

    if (!access_token) {
      return NextResponse.json(
        { success: false, error: "Missing access token" },
        { status: 400 }
      )
    }

    const response = NextResponse.json({ success: true })
    const secure = process.env.NODE_ENV === "production"
    const expires = typeof expires_at === "number"
      ? new Date(expires_at * 1000)
      : new Date(Date.now() + ONE_YEAR_SECONDS * 1000)

    response.cookies.set("sb-access-token", access_token, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      expires,
    })

    response.cookies.set("sb-refresh-token", refresh_token ?? "", {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      expires: new Date(Date.now() + ONE_YEAR_SECONDS * 1000),
    })

    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}