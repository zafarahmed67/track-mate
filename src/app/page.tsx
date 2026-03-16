import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <Link href="/" className="text-xl font-bold tracking-tight">
            TrackMate
          </Link>

          <div className="flex items-center gap-3">
            <Button asChild variant="ghost">
              <Link href="/login">Login</Link>
            </Button>
            <Button asChild>
              <Link href="/planner/new">Start Planning</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-4xl text-center">
          <p className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Australian Road Trip Planner
          </p>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Plan smarter trips with verified stops only
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            TrackMate helps caravan and lap-style travellers build route-aware
            itineraries using verified stop data, not made-up suggestions.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/planner/new">Start Planning</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Login</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 pb-20">
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardContent className="p-6">
              <h3 className="mb-2 text-lg font-semibold">Verified Stops</h3>
              <p className="text-sm text-muted-foreground">
                Built from a maintained stop database, so route suggestions stay
                grounded and reliable.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="mb-2 text-lg font-semibold">Route-Aware Planning</h3>
              <p className="text-sm text-muted-foreground">
                Stops are filtered based on the actual travel corridor between
                your origin and destination.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="mb-2 text-lg font-semibold">Rig-Friendly Filters</h3>
              <p className="text-sm text-muted-foreground">
                Consider rig type, pet-friendly options, stay preference, and
                road suitability from the start.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  )
}