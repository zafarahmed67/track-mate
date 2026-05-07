import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/config/supabase"

export async function getServerSession() {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get("sb-access-token")?.value
  const refreshToken = cookieStore.get("sb-refresh-token")?.value

  if (!supabaseAdmin) {
    return null
  }

  // Try the existing access token first
  if (accessToken) {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken)
    if (!error && user) {
      return { user, accessToken, refreshToken }
    }
  }

  // Access token missing or expired — attempt refresh
  if (refreshToken) {
    const { data, error: refreshError } = await supabaseAdmin.auth.refreshSession({ refresh_token: refreshToken })
    if (!refreshError && data.session && data.user) {
      // Persist the new tokens back to cookies so subsequent requests work
      const secure = process.env.NODE_ENV === "production"
      const ONE_YEAR_MS = 60 * 60 * 24 * 365 * 1000
      const cookieStore2 = await cookies()
      // Next.js cookies() is read-only in middleware but writable in route handlers via NextResponse.
      // We store them on the response object via a helper instead; here we just return the refreshed session.
      // The admin page's fetchStats will receive a Set-Cookie header from the stats route if we attach it there.
      void secure // suppress lint warning — used below in the response helper
      void cookieStore2
      void ONE_YEAR_MS
      return { user: data.user, accessToken: data.session.access_token, refreshToken: data.session.refresh_token, newSession: data.session }
    }
  }

  return null
}

/** Attach refreshed Supabase tokens to an existing NextResponse when the session was silently refreshed. */
export function attachRefreshedTokens(
  response: NextResponse,
  session: { access_token: string; refresh_token: string; expires_at?: number }
) {
  const secure = process.env.NODE_ENV === "production"
  const ONE_YEAR_MS = 60 * 60 * 24 * 365 * 1000
  const expires = session.expires_at
    ? new Date(session.expires_at * 1000)
    : new Date(Date.now() + ONE_YEAR_MS)

  response.cookies.set("sb-access-token", session.access_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires,
  })
  response.cookies.set("sb-refresh-token", session.refresh_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + ONE_YEAR_MS),
  })
}

export async function getServerUser() {
  const session = await getServerSession()
  if (!session) return null

  const { data } = await supabaseAdmin!
    .from("users")
    .select("*")
    .eq("email", session.user.email)
    .single()

  return data
}

export async function requireAdmin() {
  const user = await getServerUser()

  if (!user) {
    return { error: "Authentication required", status: 401 }
  }

  if (user.role !== "admin") {
    return { error: "Admin access required", status: 403 }
  }

  return { user }
}
