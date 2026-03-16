"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    // Replace with your auth action
    console.log("Send magic link to:", email)
    setSubmitted(true)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <Link href="/" className="mx-auto text-2xl font-bold tracking-tight">
            TrackMate
          </Link>
          <CardTitle className="text-2xl">Login</CardTitle>
          <CardDescription>
            Enter your email and we&apos;ll send you a secure magic link.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" className="w-full">
                Send Magic Link
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Back to{" "}
                <Link href="/" className="font-medium underline underline-offset-4">
                  home
                </Link>
              </p>
            </form>
          ) : (
            <div className="space-y-4 text-center">
              <div>
                <h2 className="text-xl font-semibold">Check your email</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  We sent a secure login link to <span className="font-medium">{email}</span>.
                </p>
              </div>

              <Button variant="outline" className="w-full" onClick={() => setSubmitted(false)}>
                Use a different email
              </Button>

              <p className="text-sm text-muted-foreground">
                Didn&apos;t get it? Check spam or try again.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}