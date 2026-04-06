"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@supabase/supabase-js"
import { Suspense } from "react"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHED_KEY!,
  {
    auth: {
      flowType: "implicit",
      detectSessionInUrl: true,
    },
  }
)

interface UserRecord {
  userId: string
  role: string
  access_status: string
}

async function ensureUserInDatabase(email: string, userId: string): Promise<UserRecord | null> {
  try {
    const response = await fetch("/api/auth/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, userId }),
    })
    const result = await response.json()
    if (!result.success) return null
    return {
      userId: result.userId,
      role: result.role ?? "customer",
      access_status: result.access_status ?? "inactive",
    }
  } catch {
    return null
  }
}

function AuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [redirecting, setRedirecting] = useState(false)

  useEffect(() => {
    async function handleCallback() {
      try {
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const accessToken = hashParams.get("access_token") || searchParams.get("access_token")
        const type = hashParams.get("type") || searchParams.get("type")

        if (accessToken && (type === "magiclink" || type === "invite")) {
          const { data: { session }, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: hashParams.get("refresh_token") || "",
          })

          if (sessionError) {
            console.error("Session error:", sessionError)
            setRedirecting(true)
            router.replace("/login?error=invalid_session")
            return
          }

          if (session) {
            const userRecord = await ensureUserInDatabase(session.user.email!, session.user.id)

            if (!userRecord) {
              setRedirecting(true)
              router.replace("/login?error=user_not_found")
              return
            }

            localStorage.setItem("trackmate_access_token", session.access_token)
            localStorage.setItem("trackmate_refresh_token", session.refresh_token ?? "")
            localStorage.setItem("trackmate_expires_at", String(session.expires_at))
            localStorage.setItem("trackmate_token_type", session.token_type)
            localStorage.setItem("trackmate_user", JSON.stringify({
              id: session.user.id,
              email: session.user.email,
              role: userRecord.role,
              access_status: userRecord.access_status,
            }))

            router.replace(userRecord.access_status === "active" || userRecord.role === "admin" ? "/planner" : "/no-access")
            return
          }
        }

        const { data: { session } } = await supabase.auth.getSession()

        if (session) {
          const userRecord = await ensureUserInDatabase(session.user.email!, session.user.id)

          if (!userRecord) {
            setRedirecting(true)
            router.replace("/login?error=user_not_found")
            return
          }

          localStorage.setItem("trackmate_access_token", session.access_token)
          localStorage.setItem("trackmate_refresh_token", session.refresh_token ?? "")
          localStorage.setItem("trackmate_expires_at", String(session.expires_at))
          localStorage.setItem("trackmate_token_type", session.token_type)
          localStorage.setItem("trackmate_user", JSON.stringify({
            id: session.user.id,
            email: session.user.email,
            role: userRecord.role,
            access_status: userRecord.access_status,
          }))

          router.replace(userRecord.access_status === "active" || userRecord.role === "admin" ? "/planner" : "/no-access")
          return
        }

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
          if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
            const { data: { session } } = await supabase.auth.getSession()

            if (session) {
              const userRecord = await ensureUserInDatabase(session.user.email!, session.user.id)

              if (!userRecord) {
                setRedirecting(true)
                router.replace("/login?error=user_not_found")
                return
              }

              localStorage.setItem("trackmate_access_token", session.access_token)
              localStorage.setItem("trackmate_refresh_token", session.refresh_token ?? "")
              localStorage.setItem("trackmate_expires_at", String(session.expires_at))
              localStorage.setItem("trackmate_token_type", session.token_type)
              localStorage.setItem("trackmate_user", JSON.stringify({
                id: session.user.id,
                email: session.user.email,
                role: userRecord.role,
                access_status: userRecord.access_status,
              }))

              router.replace(userRecord.access_status === "active" || userRecord.role === "admin" ? "/planner" : "/no-access")
            }
          }
        })

        return () => subscription.unsubscribe()
      } catch (err) {
        console.error("Auth callback error:", err)
        setRedirecting(true)
        router.replace("/login?error=unexpected")
      }
    }

    handleCallback()
  }, [router, searchParams])

  if (error || redirecting) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Redirecting…</p>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Signing you in…</p>
    </main>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    }>
      <AuthCallbackContent />
    </Suspense>
  )
}
