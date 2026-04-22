import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MapPin } from 'lucide-react'
import React from 'react'

interface DrivingInfo {
    totalDistanceKm: number
    totalDurationMinutes: number
}

interface RouteMeta {
    corridor?: string | undefined
    drivingInfo?: DrivingInfo | undefined
}

interface TripData {
    start_location_text: string
    destination_text: string
    trip_duration_days: number
    travel_pace: string
}

interface TripRouteOverviewProps {
    routeMeta: Partial<RouteMeta>
    trip: TripData
    formatDistance: (distanceKm: number) => string
    formatDuration: (minutes: number) => string
    computeEstimatedDays: () => number
    capitalize: (value: string | undefined) => string
    getRouteDescription: () => string
}

export default function TripRouteOverview({
    routeMeta,
    trip,
    formatDistance,
    formatDuration,
    computeEstimatedDays,
    capitalize,
    getRouteDescription,
}: TripRouteOverviewProps) {
    return (
        <Card className="border">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Route Overview</CardTitle>
                    {routeMeta.corridor && (
                        <Badge variant="secondary" className="rounded-full px-3 py-1 text-sm">
                            {routeMeta.corridor}
                        </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="rounded-2xl bg-linear-to-r from-primary/5 to-primary/10 p-4 border border-primary/10">
                    <div className="flex items-center gap-3 mb-3">
                        <MapPin className="h-5 w-5 text-primary" />
                        <div className="flex items-center gap-2 text-sm">
                            <span className="font-semibold">{trip.start_location_text}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="font-semibold">{trip.destination_text}</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                            <div className="text-xs text-muted-foreground">Distance</div>
                            <div className="text-lg font-bold">{routeMeta.drivingInfo ? formatDistance(routeMeta.drivingInfo.totalDistanceKm) : "—"}</div>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground">Drive time</div>
                            <div className="text-lg font-bold">{routeMeta.drivingInfo ? formatDuration(routeMeta.drivingInfo.totalDurationMinutes) : "—"}</div>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground">Suggested days</div>
                            <div className="text-lg font-bold">{routeMeta.drivingInfo ? `${computeEstimatedDays()}` : `${trip.trip_duration_days}`}</div>
                        </div>
                    </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                        <div className="text-sm text-muted-foreground mb-1">Route corridor</div>
                        <div className="font-medium">{routeMeta.corridor || "Calculating route corridor..."}</div>
                    </div>
                    <div>
                        <div className="text-sm text-muted-foreground mb-1">Travel style</div>
                        <div className="font-medium">{capitalize(trip.travel_pace) || "Moderate"}</div>
                    </div>
                </div>
                <div className="rounded-2xl bg-muted/5 p-4 text-sm">
                    <div className="font-medium text-foreground mb-1">Route description</div>
                    <p className="text-muted-foreground">{getRouteDescription()}</p>
                </div>
                <div>
                    <div className="text-sm text-muted-foreground mb-2">Why this plan works</div>
                    <ul className="space-y-2 text-sm">
                        <li>Balanced driving days based on selected pace.</li>
                        <li>Overnight stop options grouped along the route.</li>
                        <li>Fuel considered before more remote northern stretches.</li>
                    </ul>
                </div>
            </CardContent>
        </Card>
    )
}
