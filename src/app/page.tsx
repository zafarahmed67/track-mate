"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { isAuthenticated, getStoredUser, logout, hasAccess } from "@/lib/auth"
import {
  MapPin,
  Navigation,
  Sparkles,
  ArrowRight,
  Truck,
  FileText,
  MessageSquare,
  Fuel,
  ShieldCheck,
  ChevronRight,
  Star,
  CheckCircle2,
  Map as MapIcon,
} from "lucide-react"

export default function LandingPage() {
  const router = useRouter()
  const [loggedIn, setLoggedIn] = useState(false)
  const [hasActiveAccess, setHasActiveAccess] = useState(false)
  const [userEmail, setUserEmail] = useState("")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const isLoggedIn = isAuthenticated()
    const hasAccessStatus = hasAccess()
    setLoggedIn(isLoggedIn)
    setHasActiveAccess(hasAccessStatus)
    setUserEmail(getStoredUser()?.email || "")
  }, [])

  const handleLogout = () => {
    logout()
    setLoggedIn(false)
    setHasActiveAccess(false)
    setUserEmail("")
    router.push("/")
  }

  const steps = [
    { number: "01", title: "Enter your trip", description: "Add your start, destination, travel pace, rig type and preferences." },
    { number: "02", title: "We build your route plan", description: "Your trip is mapped into realistic driving days with stop options and fuel guidance along the way." },
    { number: "03", title: "Adjust as you go", description: "Refine your plan and make changes while keeping everything aligned." },
  ]

  const features = [
    {
      icon: ShieldCheck,
      title: "Caravan-friendly routing",
      description: "Routes are selected to suit caravans, prioritising sealed roads and realistic travel paths.",
    },
    {
      icon: Navigation,
      title: "Smart stop options",
      description: "See a small number of relevant stop options at each location — not endless lists.",
    },
    {
      icon: Truck,
      title: "Fuel planning built in",
      description: "Know where to fuel before longer or more remote stretches.",
    },
    {
      icon: Fuel,
      title: "Route-based planning",
      description: "Stops are aligned to your actual route, not just nearby locations.",
    },
    {
      icon: MessageSquare,
      title: "Works across Australia",
      description: "Designed to handle both busy routes and remote areas.",
    },
    {
      icon: FileText,
      title: "Download your plan",
      description: "Export your itinerary and take it with you on the road.",
    },
  ]

  const testimonials = [
    {
      quote: "Finally a planner that doesn't suggest stops that don't exist. Every place it recommended was real and suited our 22ft van.",
      author: "Karen & Dave",
      trip: "Darwin to Adelaide lap",
    },
    {
      quote: "The fuel gap warning saved us on the Nullarbor. We almost skipped a stop that turned out to be the last servo for 250km.",
      author: "Steve M.",
      trip: "Perth → Brisbane",
    },
    {
      quote: "We refined our route three times with the chat feature. It remembered everything and adjusted each time perfectly.",
      author: "The Robinsons",
      trip: "Cairns to Cape York",
    },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">

      {/* ── NAV ── */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b bg-background/90 backdrop-blur-md">
        <div className="container mx-auto flex items-center justify-between px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Truck className="h-4.5 w-4.5" />
            </div>
            <span className="text-lg font-bold tracking-tight">TrackMate</span>
          </Link>

          <nav className="flex items-center gap-1">
            {mounted && hasActiveAccess ? (
              <>
                <span className="mr-2 text-sm text-muted-foreground hidden sm:inline truncate max-w-[180px]">{userEmail}</span>
                <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground">Logout</Button>
                <Button asChild size="sm" className="ml-1">
                  <Link href="/planner">My Trips <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link>
                </Button>
              </>
            ) : (
              <>
                {loggedIn && (
                  <span className="mr-2 text-sm text-amber-600 hidden sm:inline">No Access</span>
                )}
                <Button asChild variant="ghost" size="sm"><Link href="/login">Login</Link></Button>
                <Button asChild size="sm" className="ml-1">
                  <Link href="/planner/new">Start Planning</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="relative pt-28 pb-24 overflow-hidden">
        {/* Background blobs */}
        <div className="pointer-events-none absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full bg-primary/5 blur-3xl" />
        <div className="pointer-events-none absolute top-20 -left-40 h-[400px] w-[400px] rounded-full bg-primary/8 blur-3xl" />

        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-5xl">

            <h1
              className={`text-center text-5xl font-bold tracking-tight leading-[1.1] sm:text-6xl lg:text-7xl transition-all duration-700 delay-100 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
            >
              Plan your next leg

              <span className="relative inline-block">
                <span className="relative z-10 text-primary">with confidence</span>
                <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 300 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2 8 Q75 2 150 8 Q225 14 298 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-primary/30" />
                </svg>
              </span>
            </h1>

            <p
              className={`mx-auto mt-8 max-w-2xl text-center text-lg text-muted-foreground leading-relaxed transition-all duration-700 delay-200 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
            >
              TrackMate helps you map realistic driving days, find the right stops, and plan fuel properly — so you don’t have to second guess your route.
            </p>

            <div
              className={`mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row transition-all duration-700 delay-300 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
            >
              <Button asChild size="lg" className="h-12 px-8 text-base font-medium group w-full sm:w-auto">
                <Link href={hasActiveAccess ? "/planner" : "/planner/new"}>
                  {hasActiveAccess ? "Go to My Trips" : "Start Planning Free"}
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              {hasActiveAccess ? (
                <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base w-full sm:w-auto">
                  <Link href="/planner">View My Trips</Link>
                </Button>
              ) : (
                <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base w-full sm:w-auto">
                  <Link href="/login">Login to your account</Link>
                </Button>
              )}
            </div>

            {/* Hero visual — route mockup */}
            <div
              className={`mt-16 transition-all duration-1000 delay-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
            >
              <div className="relative mx-auto max-w-3xl rounded-2xl border bg-card shadow-xl overflow-hidden">
                <img src="/track-mate.png" alt="" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section className="border-y bg-muted/30">
        <div className="container mx-auto px-6 py-8">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 text-center">
            {[
              { value: "165+", label: "Verified stops" },
              { value: "10+", label: "Filter options" },
              { value: "100%", label: "Route-matched" },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-3xl font-bold text-primary">{s.value}</div>
                <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">How it works</p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Plan your next leg in minutes
            </h2>
          </div>

          <div className="mx-auto max-w-4xl relative">
            {/* Connecting line */}
            <div className="absolute top-9 left-[calc(1.75rem)] right-[calc(1.75rem)] h-px bg-border hidden lg:block" style={{ left: "calc(16.67% + 1.75rem)", right: "calc(16.67% + 1.75rem)" }} />

            <div className="grid gap-10 lg:grid-cols-3">
              {steps.map((step, i) => (
                <div key={step.number} className="relative flex flex-col items-center text-center lg:items-start lg:text-left">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-xl font-bold mb-5 shrink-0 shadow-lg shadow-primary/20">
                    {step.number}
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{step.description}</p>
                  {i < steps.length - 1 && (
                    <ChevronRight className="hidden lg:block absolute -right-5 top-4 h-5 w-5 text-muted-foreground/30" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="py-24 bg-muted/20 border-y">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">Features</p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need to plan your next leg
            </h2>
            <p className="mt-4 text-muted-foreground">Built for Australian caravan and road trips — not a generic travel app.</p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border bg-card p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-md hover:border-primary/20"
              >
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/8 group-hover:bg-primary/15 transition-colors">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">Traveller stories</p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Trusted by real road trippers</h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
            {testimonials.map((t, i) => (
              <div key={i} className="rounded-2xl border bg-card p-6 flex flex-col gap-4">
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-brand-3 text-brand-3" />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed flex-1">&quot;{t.quote}&quot;</p>
                <div>
                  <p className="font-semibold text-sm">{t.author}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3" />{t.trip}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRUST STRIP ── */}
      <section className="border-y py-10 bg-muted/10">
        <div className="container mx-auto px-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-10 text-sm text-muted-foreground">
            {[
              { icon: ShieldCheck, text: "Purchase-gated access" },
              { icon: MapIcon, text: "Google Maps routing" },
              { icon: Sparkles, text: "GPT-4o-mini AI" },
              { icon: CheckCircle2, text: "Verified stop database" },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-2">
                <item.icon className="h-4 w-4 text-brand-3" />
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-28 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-primary/5 via-transparent to-primary/5" />
        <div className="pointer-events-none absolute -bottom-20 left-1/2 -translate-x-1/2 h-100 w-200 rounded-full bg-primary/5 blur-3xl" />

        <div className="container mx-auto px-6 relative">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xl shadow-primary/20">
              <Truck className="h-8 w-8" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl mb-5">
              Ready to hit the road?
            </h2>
            <p className="text-lg text-muted-foreground mb-10">
              Join Australian travellers who plan smarter with TrackMate.Purchase once, plan as many trips as you need.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              {hasActiveAccess ? (
                <>
                  <Button asChild size="lg" className="h-13 px-10 text-base font-medium group w-full sm:w-auto shadow-lg shadow-primary/20">
                    <Link href="/planner">
                      Go to My Trips
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="h-13 px-10 text-base w-full sm:w-auto">
                    <Link href="/planner">View My Trips</Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild size="lg" className="h-13 px-10 text-base font-medium group w-full sm:w-auto shadow-lg shadow-primary/20">
                    <Link href="/planner/new">
                      Get Started
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="h-13 px-10 text-base w-full sm:w-auto">
                    <Link href="/login">I already have access</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t py-10 bg-muted/10">
        <div className="container mx-auto px-6">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Truck className="h-4 w-4" />
              </div>
              <span className="font-semibold">TrackMate</span>
              <span className="text-muted-foreground text-sm">by All Around Oz</span>
            </div>

            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/login" className="hover:text-foreground transition-colors">Login</Link>
              <Link href="/planner/new" className="hover:text-foreground transition-colors">Start Planning</Link>
              <a href="mailto:support@allaroundoz.com.au" className="hover:text-foreground transition-colors">Support</a>
            </div>

            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} All Around Oz
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
