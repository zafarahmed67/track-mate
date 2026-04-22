"use client"

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface TripPlanningControlsCardProps {
  travelPace: string | undefined
  preferredLegLengthKm: number
  setPreferredLegLengthKm: (value: number) => void
  avoidLongDays: boolean
  setAvoidLongDays: (updater: (prev: boolean) => boolean) => void
  preferVerifiedStops: boolean
  setPreferVerifiedStops: (updater: (prev: boolean) => boolean) => void
  includeFreeCamps: boolean
  setIncludeFreeCamps: (updater: (prev: boolean) => boolean) => void
  includeFuelPlanning: boolean
  setIncludeFuelPlanning: (updater: (prev: boolean) => boolean) => void
  routeOptionsLoading: boolean
  handleRebuildPlan: () => void
}

const capitalize = (value: string | undefined) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : ''

export default function TripPlanningControlsCard({
  travelPace,
  preferredLegLengthKm,
  setPreferredLegLengthKm,
  avoidLongDays,
  setAvoidLongDays,
  preferVerifiedStops,
  setPreferVerifiedStops,
  includeFreeCamps,
  setIncludeFreeCamps,
  includeFuelPlanning,
  setIncludeFuelPlanning,
  routeOptionsLoading,
  handleRebuildPlan,
}: TripPlanningControlsCardProps) {
  return (
    <Card className="border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Planning controls</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <div className="text-sm text-muted-foreground mb-2">Travel pace</div>
          <div className="flex flex-wrap gap-2">
            {['leisure', 'moderate', 'brisk'].map((pace) => (
              <Button
                key={pace}
                variant={travelPace === pace ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => toast(`Selected ${pace}`)}
              >
                {capitalize(pace)}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground mb-2">Preferred leg length</div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={preferredLegLengthKm}
              onChange={(e) => setPreferredLegLengthKm(Number(e.target.value))}
              className="w-24 rounded-lg border bg-background px-3 py-2 text-sm outline-none"
            />
            <span className="text-sm text-muted-foreground">km</span>
          </div>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span>Avoid long days</span>
            <Button variant={avoidLongDays ? 'secondary' : 'outline'} size="sm" onClick={() => setAvoidLongDays((v) => !v)}>
              {avoidLongDays ? 'On' : 'Off'}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <span>Prefer verified stops</span>
            <Button variant={preferVerifiedStops ? 'secondary' : 'outline'} size="sm" onClick={() => setPreferVerifiedStops((v) => !v)}>
              {preferVerifiedStops ? 'On' : 'Off'}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <span>Include free camps</span>
            <Button variant={includeFreeCamps ? 'secondary' : 'outline'} size="sm" onClick={() => setIncludeFreeCamps((v) => !v)}>
              {includeFreeCamps ? 'On' : 'Off'}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <span>Include fuel planning</span>
            <Button variant={includeFuelPlanning ? 'secondary' : 'outline'} size="sm" onClick={() => setIncludeFuelPlanning((v) => !v)}>
              {includeFuelPlanning ? 'On' : 'Off'}
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button className="w-full" onClick={handleRebuildPlan} disabled={routeOptionsLoading}>
            Rebuild plan
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
