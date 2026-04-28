import { env } from "@/config/env.config";

export interface PlacesBudgetOptions {
  tripDurationDays: number;
  /** Max API calls; overrides scaling formula when provided. */
  maxCalls?: number;
  /** Max radius/spacing relaxation passes a generator may attempt. */
  maxRadiusExpansions?: number;
  /**
   * How many stop options the trip still needs to fill from outside the verified
   * pool. When provided, the cap is derived from the gap (max(10, gap*5)) and
   * clamped against the days-based scaled cap and hard cap. Lets a small
   * top-up trip avoid spending a full days-based budget.
   */
  gapToFill?: number;
}

/**
 * Per-trip Places API budget + dedup tracker.
 *
 * Threaded through generators so they can:
 *   1) check the cap before each fetch (hard limit on cost),
 *   2) refuse duplicate probes within the same trip (no wasted call),
 *   3) early-exit once a target count is reached, and
 *   4) skip whole probe points where the global cache already returned enough.
 */
export class PlacesBudget {
  readonly maxCalls: number;
  readonly maxRadiusExpansions: number;
  readonly gapToFill: number | null;

  callsMade = 0;
  cacheHits = 0;
  cacheMisses = 0;

  /** Count of Google API calls by endpoint (nearbysearch, textsearch, directions, ...). */
  readonly byEndpoint: Record<string, number> = {};

  private readonly seenProbeKeys = new Set<string>();
  private readonly seenPlaceIds = new Set<string>();
  private readonly satisfiedPoints = new Set<string>();

  constructor(opts: PlacesBudgetOptions) {
    const days = Math.max(1, Math.round(Number(opts.tripDurationDays) || 1));
    const scaled = days * env.MAX_PLACES_CALLS_PER_TRIP_BASE;
    const hardCap = env.MAX_PLACES_CALLS_PER_TRIP_HARD_CAP;
    const gap =
      typeof opts.gapToFill === "number" && Number.isFinite(opts.gapToFill)
        ? Math.max(0, Math.round(opts.gapToFill))
        : null;
    this.gapToFill = gap;

    let cap: number;
    if (opts.maxCalls !== undefined) {
      cap = opts.maxCalls;
    } else if (gap !== null) {
      // Gap-aware cap: enough headroom to discover ~5 candidates per missing
      // stop, but never more than the days-based scaled cap.
      const gapCap = Math.max(10, gap * 5);
      cap = Math.min(gapCap, scaled, hardCap);
    } else {
      cap = Math.min(scaled, hardCap);
    }

    this.maxCalls = Math.max(0, cap);
    this.maxRadiusExpansions =
      opts.maxRadiusExpansions ?? env.MAX_RADIUS_EXPANSIONS;
  }

  get remaining(): number {
    return Math.max(0, this.maxCalls - this.callsMade);
  }

  get exhausted(): boolean {
    return this.callsMade >= this.maxCalls;
  }

  /**
   * Reserve one Places call slot for a probe. Returns false if budget exhausted
   * or this exact probe has already been issued in this trip.
   *
   * Pass `endpoint` (e.g. "nearbysearch", "textsearch") to break down the
   * count by API surface in `summary().byEndpoint`.
   */
  tryConsume(probeKey: string, endpoint = "nearbysearch"): boolean {
    if (this.exhausted) return false;
    if (this.seenProbeKeys.has(probeKey)) return false;
    this.seenProbeKeys.add(probeKey);
    this.callsMade += 1;
    this.byEndpoint[endpoint] = (this.byEndpoint[endpoint] ?? 0) + 1;
    return true;
  }

  /**
   * Record a Google call that bypasses the probe-dedup gate (e.g. the
   * Directions request used to fetch the route polyline). Increments the
   * endpoint counter without consuming a probe slot, so it shows up in the
   * usage breakdown but doesn't burn the per-trip budget.
   */
  recordCall(endpoint: string): void {
    this.byEndpoint[endpoint] = (this.byEndpoint[endpoint] ?? 0) + 1;
  }

  /** Mark a place as already seen in this trip so it isn't re-fetched. */
  recordPlace(placeId: string | null | undefined): void {
    if (placeId) this.seenPlaceIds.add(placeId);
  }

  hasSeenPlace(placeId: string | null | undefined): boolean {
    return !!placeId && this.seenPlaceIds.has(placeId);
  }

  /** Note that the cache supplied enough candidates near this point — skip Places probes here. */
  markPointSatisfied(pointKey: string): void {
    this.satisfiedPoints.add(pointKey);
  }

  isPointSatisfied(pointKey: string): boolean {
    return this.satisfiedPoints.has(pointKey);
  }

  noteCacheHit(): void {
    this.cacheHits += 1;
  }

  noteCacheMiss(): void {
    this.cacheMisses += 1;
  }

  summary(): {
    callsMade: number;
    maxCalls: number;
    cacheHits: number;
    cacheMisses: number;
    pointsSatisfiedByCache: number;
    gapToFill: number | null;
    byEndpoint: Record<string, number>;
  } {
    return {
      callsMade: this.callsMade,
      maxCalls: this.maxCalls,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      pointsSatisfiedByCache: this.satisfiedPoints.size,
      gapToFill: this.gapToFill,
      byEndpoint: { ...this.byEndpoint },
    };
  }
}

/** Stable probe key from lat/lng (rounded), radius, and search type. */
export function buildProbeKey(
  lat: number,
  lng: number,
  radiusMetres: number,
  type: string,
  keyword?: string,
): string {
  const latR = Math.round(lat * 100) / 100;
  const lngR = Math.round(lng * 100) / 100;
  const radR = Math.round(radiusMetres / 1000);
  return `${latR}|${lngR}|${radR}|${type}|${keyword ?? ""}`;
}

/** Stable point key (lat/lng only, rounded) for marking probe points satisfied by cache. */
export function buildPointKey(lat: number, lng: number): string {
  const latR = Math.round(lat * 100) / 100;
  const lngR = Math.round(lng * 100) / 100;
  return `${latR}|${lngR}`;
}
