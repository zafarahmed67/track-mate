import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import React from 'react'

export interface PlacesBudgetSummary {
    callsMade: number
    maxCalls: number
    cacheHits: number
    cacheMisses: number
    pointsSatisfiedByCache: number
    gapToFill: number | null
    byEndpoint?: Record<string, number>
    capturedAt?: string
}

export interface PlacesApiLogAggregate {
    total: number
    byEndpoint: Record<string, number>
    byOutcome: Record<string, number>
}

interface TripPlanningAlertsProps {
    routeWarnings: string[]
    placesBudget?: PlacesBudgetSummary | null
    placesApiLog?: PlacesApiLogAggregate | null
}

function classifyCacheRegime(summary: PlacesBudgetSummary): {
    label: string
    tone: 'cold' | 'warm' | 'hot'
} {
    if (summary.callsMade === 0) return { label: 'Hot cache', tone: 'hot' }
    if (summary.callsMade <= 25) return { label: 'Warm cache', tone: 'warm' }
    return { label: 'Cold cache', tone: 'cold' }
}

const TONE_CLASSES: Record<'cold' | 'warm' | 'hot', string> = {
    cold: 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400',
    warm: 'border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-400',
    hot: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400',
}

export default function TripPlanningAlerts({
    routeWarnings,
    placesBudget,
    placesApiLog,
}: TripPlanningAlertsProps) {
    const regime = placesBudget ? classifyCacheRegime(placesBudget) : null

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

                {placesBudget && regime && (
                    <div className={`rounded-lg border p-3 ${TONE_CLASSES[regime.tone]}`}>
                        <div className="flex items-center justify-between">
                            <span className="font-medium">Places API usage</span>
                            <span className="text-xs uppercase tracking-wide">{regime.label}</span>
                        </div>
                        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            <dt className="text-muted-foreground">Calls made</dt>
                            <dd className="text-right font-mono">
                                {placesBudget.callsMade} / {placesBudget.maxCalls}
                            </dd>
                            <dt className="text-muted-foreground">Cache hits</dt>
                            <dd className="text-right font-mono">{placesBudget.cacheHits}</dd>
                            <dt className="text-muted-foreground">Probe points satisfied by cache</dt>
                            <dd className="text-right font-mono">{placesBudget.pointsSatisfiedByCache}</dd>
                            {placesBudget.gapToFill !== null && (
                                <>
                                    <dt className="text-muted-foreground">Gap to fill</dt>
                                    <dd className="text-right font-mono">{placesBudget.gapToFill}</dd>
                                </>
                            )}
                        </dl>
                        {placesBudget.byEndpoint &&
                            Object.keys(placesBudget.byEndpoint).length > 0 && (
                                <div className="mt-3 border-t border-current/10 pt-2">
                                    <div className="mb-1 text-xs font-medium uppercase tracking-wide opacity-80">
                                        Trip-generation calls (by endpoint)
                                    </div>
                                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                        {Object.entries(placesBudget.byEndpoint)
                                            .sort(([, a], [, b]) => b - a)
                                            .map(([endpoint, count]) => (
                                                <React.Fragment key={endpoint}>
                                                    <dt className="text-muted-foreground">
                                                        {endpoint}
                                                    </dt>
                                                    <dd className="text-right font-mono">
                                                        {count}
                                                    </dd>
                                                </React.Fragment>
                                            ))}
                                    </dl>
                                </div>
                            )}
                    </div>
                )}

                {placesApiLog && placesApiLog.total >= 0 && (
                    <div className="rounded-lg border border-muted-foreground/15 bg-muted/30 p-3">
                        <div className="flex items-center justify-between">
                            <span className="font-medium">All Google calls for this trip</span>
                            <span className="text-xs text-muted-foreground">
                                from places_api_call_log
                            </span>
                        </div>
                        <div className="mt-2 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Total recorded</span>
                                <span className="font-mono">{placesApiLog.total}</span>
                            </div>
                        </div>
                        {Object.keys(placesApiLog.byEndpoint).length > 0 && (
                            <div className="mt-2">
                                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    By endpoint
                                </div>
                                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                    {Object.entries(placesApiLog.byEndpoint)
                                        .sort(([, a], [, b]) => b - a)
                                        .map(([endpoint, count]) => (
                                            <React.Fragment key={endpoint}>
                                                <dt className="text-muted-foreground">{endpoint}</dt>
                                                <dd className="text-right font-mono">{count}</dd>
                                            </React.Fragment>
                                        ))}
                                </dl>
                            </div>
                        )}
                        {Object.keys(placesApiLog.byOutcome).length > 0 && (
                            <div className="mt-2">
                                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    By cache outcome
                                </div>
                                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                    {Object.entries(placesApiLog.byOutcome)
                                        .sort(([, a], [, b]) => b - a)
                                        .map(([outcome, count]) => (
                                            <React.Fragment key={outcome}>
                                                <dt className="text-muted-foreground">{outcome}</dt>
                                                <dd className="text-right font-mono">{count}</dd>
                                            </React.Fragment>
                                        ))}
                                </dl>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
