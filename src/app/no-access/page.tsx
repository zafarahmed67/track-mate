"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getStoredUser, logout } from "@/lib/auth"
import { LockKeyhole, Mail, LogOut } from "lucide-react"

export default function NoAccessPage() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    const user = getStoredUser()
    // If not logged in at all, send to login
    if (!user?.id) {
      router.replace("/login")
      return
    }
    // If somehow they have access, send them to planner
    if (user.role === "admin" || user.access_status === "active") {
      router.replace("/planner")
      return
    }
    setEmail(user.email)
  }, [router])

  function handleLogout() {
    logout()
    router.replace("/login")
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="space-y-3 pb-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <LockKeyhole className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl">Access Required</CardTitle>
        </CardHeader>

        <CardContent className="space-y-5">
          <p className="text-muted-foreground text-sm">
            Your account{email ? ` (${email})` : ""} doesn&apos;t have an active TrackMate subscription.
            Purchase TrackMate to get full access to the trip planner.
          </p>

          <div className="rounded-xl bg-muted/40 p-4 text-sm text-left space-y-2">
            <p className="font-medium">Already purchased?</p>
            <p className="text-muted-foreground">
              Your access is activated automatically after purchase. If you&apos;ve just bought TrackMate,
              check your inbox for a confirmation email — it may take a minute to arrive.
            </p>
          </div>

          <div className="space-y-2">
            <Button className="w-full" onClick={() => window.location.href = "https://allaroundoz.com.au/trackmate"}>
              Purchase TrackMate
            </Button>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.location.href = "mailto:support@allaroundoz.com.au"}
            >
              <Mail className="mr-2 h-4 w-4" />
              Contact Support
            </Button>

            <Button variant="ghost" className="w-full text-muted-foreground" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
