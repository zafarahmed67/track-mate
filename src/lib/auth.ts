import { createClient } from "@supabase/supabase-js"

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem("trackmate_access_token")
}

export function getStoredUser(): { id: string; email: string; role?: string; access_status?: string } | null {
  if (typeof window === "undefined") return null
  const userStr = localStorage.getItem("trackmate_user")
  if (!userStr) return null
  try {
    return JSON.parse(userStr)
  } catch {
    return null
  }
}

export function hasAccess(): boolean {
  const user = getStoredUser()
  if (!user) return false
  if (user.role === "admin") return true
  return user.access_status === "active"
}

export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false
  
  const token = localStorage.getItem("trackmate_access_token")
  const expiresAt = localStorage.getItem("trackmate_expires_at")
  
  if (!token || !expiresAt) return false
  
  const expires = parseInt(expiresAt)
  const now = Math.floor(Date.now() / 1000)
  
  return expires > now
}

export async function refreshSession(): Promise<boolean> {
  if (typeof window === "undefined") return false
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHED_KEY!
  )
  
  const { data: { session }, error } = await supabase.auth.getSession()
  
  if (error || !session) {
    const refreshToken = localStorage.getItem("trackmate_refresh_token")
    if (refreshToken) {
      const { data: { session: newSession } } = await supabase.auth.refreshSession({
        refresh_token: refreshToken,
      })
      if (newSession) {
        localStorage.setItem("trackmate_access_token", newSession.access_token)
        localStorage.setItem("trackmate_refresh_token", newSession.refresh_token ?? "")
        localStorage.setItem("trackmate_expires_at", String(newSession.expires_at))
        localStorage.setItem("trackmate_token_type", newSession.token_type)
        const existingUser = getStoredUser()
        localStorage.setItem("trackmate_user", JSON.stringify({
          id: newSession.user.id,
          email: newSession.user.email,
          role: existingUser?.role,
          access_status: existingUser?.access_status,
        }))
        return true
      }
    }
    return false
  }

  const existingUser = getStoredUser()
  localStorage.setItem("trackmate_access_token", session.access_token)
  localStorage.setItem("trackmate_refresh_token", session.refresh_token ?? "")
  localStorage.setItem("trackmate_expires_at", String(session.expires_at))
  localStorage.setItem("trackmate_token_type", session.token_type)
  localStorage.setItem("trackmate_user", JSON.stringify({
    id: session.user.id,
    email: session.user.email,
    role: existingUser?.role,
    access_status: existingUser?.access_status,
  }))
  return true
}

export function logout(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem("trackmate_access_token")
  localStorage.removeItem("trackmate_refresh_token")
  localStorage.removeItem("trackmate_expires_at")
  localStorage.removeItem("trackmate_token_type")
  localStorage.removeItem("trackmate_user")
}
