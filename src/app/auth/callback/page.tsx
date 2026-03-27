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
    // Supabase magic links pass tokens in the URL hash.
    // onAuthStateChange fires once the client parses the hash and establishes a session.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
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
