import { env } from "@/config/env.config";

export interface PlacesBudgetOptions {
  tripDurationDays: number;
  /** Max API calls; overrides scaling formula when provided. */
  maxCalls?: number;
  /** Max radius/spacing relaxation passes a generator may attempt. */
  maxRadiusExpansions?: number;
}

/**
 * Per-trip Places API budget + dedup tracker.
 *
 * Threaded through generators so they can:
 *   1) check the cap before each fetch (hard limit on cost),
 *   2) refuse duplicate probes within the same trip (no wasted call), and
 *   3) early-exit once a target count is reached.
 */
export class PlacesBudget {
  readonly maxCalls: number;
  readonly maxRadiusExpansions: number;

  callsMade = 0;
  cacheHits = 0;
  cacheMisses = 0;

  private readonly seenProbeKeys = new Set<string>();
  private readonly seenPlaceIds = new Set<string>();

  constructor(opts: PlacesBudgetOptions) {
    const days = Math.max(1, Math.round(Number(opts.tripDurationDays) || 1));
    const scaled = days * env.MAX_PLACES_CALLS_PER_TRIP_BASE;
    const cap = env.MAX_PLACES_CALLS_PER_TRIP_HARD_CAP;
    this.maxCalls = opts.maxCalls ?? Math.min(scaled, cap);
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
   */
  tryConsume(probeKey: string): boolean {
    if (this.exhausted) return false;
    if (this.seenProbeKeys.has(probeKey)) return false;
    this.seenProbeKeys.add(probeKey);
    this.callsMade += 1;
    return true;
  }

  /** Mark a place as already seen in this trip so it isn't re-fetched. */
  recordPlace(placeId: string | null | undefined): void {
    if (placeId) this.seenPlaceIds.add(placeId);
  }

  hasSeenPlace(placeId: string | null | undefined): boolean {
    return !!placeId && this.seenPlaceIds.has(placeId);
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
  } {
    return {
      callsMade: this.callsMade,
      maxCalls: this.maxCalls,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
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
