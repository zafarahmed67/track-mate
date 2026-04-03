import { cookies } from "next/headers"
import { supabaseAdmin } from "@/config/supabase"

export async function getServerSession() {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get("sb-access-token")?.value
  const refreshToken = cookieStore.get("sb-refresh-token")?.value

  if (!accessToken) {
    return null
  }

  if (!supabaseAdmin) {
    return null
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(accessToken)

  if (error || !user) {
    return null
  }

  return { user, accessToken, refreshToken }
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
