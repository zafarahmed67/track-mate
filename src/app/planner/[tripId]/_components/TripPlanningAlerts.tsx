import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import React from 'react'

interface TripPlanningAlertsProps {
    routeWarnings: string[]
}

export default function TripPlanningAlerts({
    routeWarnings,
}: TripPlanningAlertsProps) {
    return (
        <Card className="border">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg">Planning Alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                {routeWarnings.length > 0 ? (
                    <ul className="space-y-2">
                        {routeWarnings.map((warning, index) => (
                            <li key={index} className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                                {warning}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="space-y-2">
                        <p className="text-muted-foreground">No major route alerts detected.</p>
                        <p>Expect a sensible plan with pacing, stops and fuel considered along the route.</p>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
