"use client"

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface TripRouteHealthCardProps {
  averageKmPerDay: () => string | number
  longestLegKm: string
  fuelStationCount: number
  longestFuelGapKm: number
  fuelCriticalCount: number
  remoteSectionCount: number
}

export default function TripRouteHealthCard({
  averageKmPerDay,
  longestLegKm,
  fuelStationCount,
  longestFuelGapKm,
  fuelCriticalCount,
  remoteSectionCount,
}: TripRouteHealthCardProps) {
  return (
    <Card className="border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Route health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span>Average leg</span>
          <span>{averageKmPerDay()} km</span>
        </div>
        <div className="flex justify-between">
          <span>Longest leg</span>
          <span>{longestLegKm} km</span>
        </div>
        <div className="flex justify-between">
          <span>Fuel stations</span>
          <span>{fuelStationCount}</span>
        </div>
        <div className="flex justify-between">
          <span>Longest fuel gap</span>
          <span>{longestFuelGapKm} km</span>
        </div>
        <div className="flex justify-between">
          <span>Fuel-critical days</span>
          <span>{fuelCriticalCount}</span>
        </div>
        <div className="flex justify-between">
          <span>Remote overnight areas</span>
          <span>{remoteSectionCount}</span>
        </div>
      </CardContent>
    </Card>
  )
}
