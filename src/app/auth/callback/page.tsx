"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHED_KEY!
)

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === "SIGNED_IN") {
        const { data: { session } } = await supabase.auth.getSession()

        if (session) {
          // Save session to localStorage so trackmate auth helpers work
          localStorage.setItem("trackmate_access_token", session.access_token)
          localStorage.setItem("trackmate_refresh_token", session.refresh_token ?? "")
          localStorage.setItem("trackmate_expires_at", String(session.expires_at))
          localStorage.setItem("trackmate_token_type", session.token_type)
          localStorage.setItem("trackmate_user", JSON.stringify({
            id: session.user.id,
            email: session.user.email,
          }))

          // Upsert user into custom users table
          await fetch("/api/auth/callback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: session.user.email,
              userId: session.user.id,
            }),
          })
        }

        router.replace("/planner")
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Signing you in…</p>
    </main>
  )
}
