"use client"

import { useEffect, useState, useCallback, useRef } from "react"
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
  Settings,
  ArrowRight,
  ChevronRight,
} from "lucide-react"
import { hasAccess } from "@/lib/auth"
import { toast } from "sonner"

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

const STATUS_FILTERS = ["all", "saved", "active", "draft"] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

export default function PlannerPage() {
  const router = useRouter()
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [pollingTripIds, setPollingTripIds] = useState<Set<string>>(new Set())
  const pollingTripIdsRef = useRef<Set<string>>(new Set())
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return

    pollingIntervalRef.current = setInterval(async () => {
      const currentPollingIds = pollingTripIdsRef.current
      if (currentPollingIds.size === 0) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
          pollingIntervalRef.current = null
        }
        return
      }

      try {
        const response = await fetch(`/api/trips?user_id=${userId}`)
        const data = await response.json()

        if (data.trips) {
          const completedTrips = data.trips.filter((t: Trip) =>
            currentPollingIds.has(t.id) && (t.status === "completed" || t.status === "saved")
          )

          if (completedTrips.length > 0) {
            completedTrips.forEach((trip: Trip) => {
              toast.success(`"${trip.title}" is ready!`)
            })
            setTrips(data.trips)
            completedTrips.forEach((t: Trip) => {
              pollingTripIdsRef.current.delete(t.id)
            })
            setPollingTripIds(new Set(pollingTripIdsRef.current))

            if (pollingTripIdsRef.current.size === 0 && pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current)
              pollingIntervalRef.current = null
            }

            const firstReady = completedTrips.find((t: Trip) => t.status === "planned")
            if (firstReady) {
              setTimeout(() => {
                router.push(`/planner/${firstReady.id}`)
              }, 1500)
            }
          }
        }
      } catch (error) {
        console.error("Polling error:", error)
      }
    }, 5000)
  }, [userId, router])

  useEffect(() => {
    async function fetchTrips() {
      try {
        const stored = localStorage.getItem("trackmate_user")
        const user = stored ? JSON.parse(stored) : null

        if (!user?.id) {
          router.replace("/login")
          return
        }

        if (!hasAccess()) {
          router.replace("/no-access")
          return
        }

        setUserId(user.id)

        const response = await fetch(`/api/trips?user_id=${user.id}`)
        const data = await response.json()

        if (data.trips) {
          setTrips(data.trips)

          const inProgressTrips = data.trips.filter((t: Trip) => t.status === "in_progress")
          if (inProgressTrips.length > 0) {
            const tripIds: Set<string> = new Set(inProgressTrips.map((t: Trip) => t.id))
            pollingTripIdsRef.current = tripIds
            setPollingTripIds(tripIds)
          }
        }
      } catch (error) {
        console.error("Error fetching trips:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchTrips()
  }, [router])

  useEffect(() => {
    if (pollingTripIds.size > 0 && userId && !pollingIntervalRef.current) {
      startPolling()
    }
  }, [pollingTripIds.size, userId, startPolling])

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [])

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
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => router.push("/settings")}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Button>
              <Button onClick={() => router.push("/planner/new")} className="group">
                <Plus className="mr-2 h-4 w-4" />
                New Trip
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </div>
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
          <>
            {/* Status filter tabs */}
            <div className="flex items-center gap-1 mb-6 border-b">
              {STATUS_FILTERS.map((f) => {
                const count = f === "all" ? trips.length : trips.filter((t) => t.status === f).length
                return (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                      statusFilter === f
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f}
                    {count > 0 && (
                      <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${statusFilter === f ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

          {(() => {
            const visible = statusFilter === "all" ? trips : trips.filter((t) => t.status === statusFilter)
            if (visible.length === 0) {
              return (
                <div className="py-16 text-center">
                  <p className="text-muted-foreground text-sm">No {statusFilter} trips yet.</p>
                </div>
              )
            }
            return (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {visible.map((trip) => {
              const pace = getPaceIcon(trip.travel_pace)
              const isProcessing = trip.status === "in_progress"
              const cardContent = (
                <Card className={`relative overflow-hidden transition-all duration-300 border-2 h-full ${
                  isProcessing
                    ? "opacity-70 cursor-not-allowed border-muted"
                    : "hover:-translate-y-1 hover:shadow-lg hover:border-primary/20 group-hover:border-primary/20"
                }`}>
                  {!isProcessing && (
                    <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-primary/5 to-transparent rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  )}

                  <CardContent className="p-0">
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <Badge
                          variant="outline"
                          className={isProcessing
                            ? "text-muted-foreground bg-muted/30 border-muted"
                            : `${pace.color} bg-primary/5 border-primary/20`}
                        >
                          {isProcessing ? "Preparing…" : trip.status}
                        </Badge>
                        {isProcessing ? (
                          <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground/50 transition-transform group-hover:translate-x-1 group-hover:text-muted-foreground" />
                        )}
                      </div>

                      <h3 className={`text-xl font-bold mb-2 transition-colors ${isProcessing ? "text-muted-foreground" : "group-hover:text-primary"}`}>
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

                      {isProcessing && (
                        <p className="text-xs text-muted-foreground mb-4">
                          Your trip is being prepared. This usually takes a moment.
                        </p>
                      )}

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
                      {!isProcessing && (
                        <span className="text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                          View Details →
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )

              return isProcessing ? (
                <div key={trip.id}>{cardContent}</div>
              ) : (
                <Link key={trip.id} href={`/planner/${trip.id}`} className="group">
                  {cardContent}
                </Link>
              )
            })}
          </div>
            )
          })()}
          </>
        )}
      </div>
    </main>
  )
}
