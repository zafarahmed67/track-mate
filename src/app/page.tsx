"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { isAuthenticated, getStoredUser, logout } from "@/lib/auth"
import { MapPin, Navigation, Settings, ArrowRight, Truck, Clock, Shield, Sparkles } from "lucide-react"

export default function LandingPage() {
  const router = useRouter()
  
  const authenticated = isAuthenticated()
  const user = getStoredUser()
  
  const [loggedIn, setLoggedIn] = useState(authenticated)
  const [userEmail, setUserEmail] = useState(user?.email || "")
  const [mounted] = useState(true)

  const handleLogout = () => {
    logout()
    setLoggedIn(false)
    setUserEmail("")
    router.push("/")
  }

  const features = [
    {
      icon: MapPin,
      title: "Verified Stops",
      description:
        "Built from a maintained stop database, so route suggestions stay grounded and reliable.",
      stat: "500+",
      statLabel: "Verified Locations",
    },
    {
      icon: Navigation,
      title: "Route-Aware Planning",
      description:
        "Stops are filtered based on the actual travel corridor between your origin and destination.",
      stat: "100%",
      statLabel: "Route Matched",
    },
    {
      icon: Settings,
      title: "Rig-Friendly Filters",
      description:
        "Consider rig type, pet-friendly options, stay preference, and road suitability from the start.",
      stat: "10+",
      statLabel: "Filter Options",
    },
  ]

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="fixed top-0 left-0 right-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/" className="group flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Truck className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">TrackMate</span>
          </Link>

          <nav className="flex items-center gap-1">
            {loggedIn ? (
              <>
                <span className="mr-3 text-sm text-muted-foreground hidden sm:inline">
                  {userEmail}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  className="text-muted-foreground"
                >
                  Logout
                </Button>
                <Button asChild size="sm" className="ml-2">
                  <Link href="/planner">My Trips</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Login</Link>
                </Button>
                <Button asChild size="sm" className="ml-2">
                  <Link href="/planner/new">Start Planning</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <section className="pt-32 pb-20">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-4xl text-center">
            <div
              className={`mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm transition-all duration-500 ${
                mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              <Sparkles className="h-4 w-4" />
              <span className="text-muted-foreground">
                Australian Road Trip Planner
              </span>
            </div>

            <h1
              className={`text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl leading-[1.1] transition-all duration-700 delay-100 ${
                mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
            >
              Plan smarter trips with{" "}
              <span className="relative">
                <span className="relative z-10">verified</span>
                <span className="absolute -bottom-1 left-0 right-0 h-3 bg-primary/10 -z-0" />
              </span>{" "}
              stops only
            </h1>

            <p
              className={`mx-auto mt-8 max-w-2xl text-lg text-muted-foreground leading-relaxed transition-all duration-700 delay-200 ${
                mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
            >
              TrackMate helps caravan and lap-style travellers build route-aware
              itineraries using verified stop data, not made-up suggestions.
            </p>

            <div
              className={`mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row transition-all duration-700 delay-300 ${
                mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
            >
              <Button asChild size="lg" className="h-12 px-8 text-base group">
                <Link href="/planner/new">
                  Start Planning
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              {loggedIn ? (
                <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base">
                  <Link href="/planner">View My Trips</Link>
                </Button>
              ) : (
                <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base">
                  <Link href="/login">Login</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 border-t">
        <div className="container mx-auto px-6">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need for the perfect trip
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Purpose-built features for Australian caravan travellers who value
              reliability over guesswork.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {features.map((feature, index) => (
              <Card
                key={feature.title}
                className={`group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg border-2 hover:border-primary/20 ${
                  mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
                style={{ transitionDelay: `${400 + index * 100}ms` }}
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-primary/5 group-hover:bg-primary/20 transition-all duration-300" />
                <CardContent className="p-8">
                  <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary/5 group-hover:bg-primary/10 transition-all duration-300">
                    <feature.icon className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="mb-3 text-xl font-semibold">{feature.title}</h3>
                  <p className="mb-6 text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold">{feature.stat}</span>
                    <span className="text-sm text-muted-foreground">
                      {feature.statLabel}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 border-t">
        <div className="container mx-auto px-6">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-6">
                Built for the road, not the office
              </h2>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/5">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold">Save hours of research</h4>
                    <p className="text-muted-foreground">
                      Stop scrolling through forums and get curated stops that actually
                      work for your rig.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/5">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold">Verified information</h4>
                    <p className="text-muted-foreground">
                      Every stop is checked for accuracy, so you can trust what you
                      see.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-4 border-2 border-dashed border-primary/10 rounded-3xl" />
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border bg-muted">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <MapPin className="h-16 w-16 mx-auto mb-4 text-primary/40" />
                    <p className="text-muted-foreground">Route preview coming soon</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 border-t bg-primary/5">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            Ready to plan your next adventure?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground mb-8">
            Join caravan travellers who plan smarter with TrackMate.
          </p>
          <Button asChild size="lg" className="h-12 px-8 text-base group">
            <Link href="/planner/new">
              Get Started Free
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t py-12">
        <div className="container mx-auto px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Truck className="h-4 w-4" />
              </div>
              <span className="font-semibold">TrackMate</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Built for Australian road trippers
            </p>
          </div>
        </div>
      </footer>
    </main>
  )
}
