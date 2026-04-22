"use client"

import { Card, CardContent } from "@/components/ui/card"

interface TripDayByDayLoadingProps {
  targetDays: number
}

export default function TripDayByDayLoading({ targetDays }: TripDayByDayLoadingProps) {
  return (
    <>
      {Array.from({ length: targetDays }, (_, idx) => (
        <Card key={`day-skeleton-${idx}`} className="border">
          <div className="border-b px-4 py-4 sm:px-5 sm:py-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
              <div className="space-y-2">
                <div className="h-5 w-40 rounded bg-muted animate-pulse" />
                <div className="h-4 w-24 rounded bg-muted animate-pulse" />
              </div>
            </div>
          </div>
          <CardContent className="space-y-3 px-4 py-4 sm:px-5 sm:py-5">
            <div className="h-20 rounded-2xl bg-muted animate-pulse" />
            <div className="h-20 rounded-2xl bg-muted animate-pulse" />
          </CardContent>
        </Card>
      ))}
    </>
  )
}
