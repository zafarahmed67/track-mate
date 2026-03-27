"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Plus,
  MapPin,
  Calendar,
  Clock,
  Route,
  ArrowRight,
  ChevronRight,
} from "lucide-react"

interface Trip {
  id: string
  title: string
  start_location_text: string
  destination_text: string
  status: string
  trip_duration_days: number
  travel_pace: string
  created_at: string
}

export default function PlannerPage() {
  const router = useRouter()
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchTrips() {
      try {
        const stored = localStorage.getItem("trackmate_user")
        const user = stored ? JSON.parse(stored) : null

        if (!user?.id) {
          router.replace("/login")
          return
        }

        const response = await fetch(`/api/trips?user_id=${user.id}`)
        const data = await response.json()

        if (data.trips) {
          setTrips(data.trips)
        }
      } catch (error) {
        console.error("Error fetching trips:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchTrips()
  }, [router])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  }

  const getPaceIcon = (pace: string) => {
    switch (pace) {
      case "relaxed":
        return { label: "Relaxed", color: "text-primary" }
      case "moderate":
        return { label: "Moderate", color: "text-primary" }
      case "fast":
        return { label: "Fast", color: "text-primary" }
      default:
        return { label: pace || "Standard", color: "text-primary" }
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="border-b bg-background/80 backdrop-blur-md sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Route className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold">My Trips</h1>
                <p className="text-sm text-muted-foreground hidden sm:block">
                  {trips.length === 0
                    ? "Plan your next adventure"
                    : `${trips.length} trip${trips.length !== 1 ? "s" : ""} planned`}
                </p>
              </div>
            </div>
            <Button onClick={() => router.push("/planner/new")} className="group">
              <Plus className="mr-2 h-4 w-4" />
              New Trip
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="relative">
              <div className="h-16 w-16 animate-pulse rounded-full bg-primary/10" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Route className="h-6 w-6 animate-spin text-primary" />
              </div>
            </div>
          </div>
        ) : trips.length === 0 ? (
          <div className="mx-auto max-w-md py-24 text-center">
            <div className="mb-8 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/5">
              <MapPin className="h-10 w-10 text-primary/40" />
            </div>
            <h2 className="text-2xl font-bold mb-3">No trips yet</h2>
            <p className="text-muted-foreground mb-8">
              Create your first trip to start planning your caravan adventure across
              Australia.
            </p>
            <Button
              onClick={() => router.push("/planner/new")}
              size="lg"
              className="group"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create First Trip
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {trips.map((trip) => {
              const pace = getPaceIcon(trip.travel_pace)
              return (
                <Link key={trip.id} href={`/planner/${trip.id}`} className="group">
                  <Card className="relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg border-2 hover:border-primary/20 h-full">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-primary/5 to-transparent rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                    <CardContent className="p-0">
                      <div className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <Badge
                            variant="outline"
                            className={`${pace.color} bg-primary/5 border-primary/20`}
                          >
                            {trip.status}
                          </Badge>
                          <ChevronRight className="h-5 w-5 text-muted-foreground/50 transition-transform group-hover:translate-x-1 group-hover:text-muted-foreground" />
                        </div>

                        <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">
                          {trip.title}
                        </h3>

                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
                          <MapPin className="h-4 w-4 shrink-0" />
                          <span className="truncate">
                            {trip.start_location_text}
                          </span>
                          <span className="shrink-0">→</span>
                          <span className="truncate">
                            {trip.destination_text}
                          </span>
                        </div>

                        <div className="flex items-center gap-6 pt-4 border-t">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/5">
                              <Calendar className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">
                                Duration
                              </p>
                              <p className="font-semibold text-sm">
                                {trip.trip_duration_days} days
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/5">
                              <Clock className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Pace</p>
                              <p className="font-semibold text-sm capitalize">
                                {pace.label}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="px-6 py-3 bg-muted/30 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          Created {formatDate(trip.created_at)}
                        </span>
                        <span className="text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                          View Details →
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
