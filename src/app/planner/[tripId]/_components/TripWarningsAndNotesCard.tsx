"use client"

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function TripWarningsAndNotesCard() {
  return (
    <Card className="border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Warnings & notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="rounded-3xl bg-muted/5 p-3 text-sm text-muted-foreground">
          Remote travel ahead, limited stop density north of Laura, and fuel reliance are part of this route. Booking is recommended for busy coastal and northern holiday areas.
        </div>
        <p className="text-muted-foreground">This note is separate from planning alerts and provides general route guidance for the trip.</p>
      </CardContent>
    </Card>
  )
}
