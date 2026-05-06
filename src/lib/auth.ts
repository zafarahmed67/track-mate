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

export function logout(): void {
  if (typeof window === "undefined") return
  void fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined)
  localStorage.removeItem("trackmate_access_token")
  localStorage.removeItem("trackmate_refresh_token")
  localStorage.removeItem("trackmate_expires_at")
  localStorage.removeItem("trackmate_token_type")
  localStorage.removeItem("trackmate_user")
}
