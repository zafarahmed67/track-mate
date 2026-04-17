export interface TripPreferences {
  rig_type: string | null
  rig_length_m: number | null
  pet_friendly_required: boolean
  avoid_gravel_roads: boolean
  stay_preference: string | null
  budget_preference: string | null
  end_date: string | null
  trip_duration_days: number
}

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
}

function parseBestSeason(bestSeason: string): { start: number; end: number } | null {
  if (!bestSeason || bestSeason.toLowerCase().includes("all year")) return null
  const parts = bestSeason.split("-").map(p => p.trim())
  if (parts.length !== 2) return null
  const start = MONTHS[parts[0]]
  const end = MONTHS[parts[1]]
  if (start === undefined || end === undefined) return null
  return { start, end }
}

function deriveMonthFromEndDate(endDate: string, durationDays: number): number {
  const end = new Date(endDate)
  const halfDurationMs = ((durationDays || 1) / 2) * 24 * 60 * 60 * 1000
  const midpoint = new Date(end.getTime() - halfDurationMs)
  return midpoint.getMonth()
}

function isMonthInSeason(month: number, season: { start: number; end: number }): boolean {
  if (season.start <= season.end) {
    return month >= season.start && month <= season.end
  }
  // Wrap-around range e.g. Oct(9)–Mar(2)
  return month >= season.start || month <= season.end
}

export interface FilterableStop {
  rig_suitability: string
  road_suitability: string
  pet_friendly: string
  stay_type: string
  cost_band: string
  max_rig_length: string
  best_season: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

export function applySuitabilityFilter<T extends FilterableStop>(
  stops: T[],
  trip: TripPreferences
): T[] {
  const travelMonth = trip.end_date
    ? deriveMonthFromEndDate(trip.end_date, trip.trip_duration_days)
    : null

  const stayPreferenceMap: Record<string, string[]> = {
    "free-camps": ["free", "campground"],
    "caravan-parks": ["caravan_park"],
  }

  const rejectionReasons: Record<string, number> = {}

  console.log("[stopSuitabilityFilter] FILTER: Starting filter with:", {
    inputStopsCount: stops.length,
    tripPreferences: {
      rig_type: trip.rig_type,
      rig_length_m: trip.rig_length_m,
      pet_friendly_required: trip.pet_friendly_required,
      avoid_gravel_roads: trip.avoid_gravel_roads,
      stay_preference: trip.stay_preference,
      budget_preference: trip.budget_preference,
      end_date: trip.end_date,
      travelMonth,
    },
    sampleStops: stops.slice(0, 5).map(s => ({
      name: s.rig_suitability ? "stop" : "unknown",
      stay_type: s.stay_type,
      cost_band: s.cost_band,
      road_suitability: s.road_suitability,
    })),
  })

  const result = stops.filter((stop) => {
    // Rule 1 — Rig suitability: non-4WD rigs cannot access 4WD-only stops
    if (trip.rig_type && trip.rig_type !== "4wd-camper") {
      const rigSuit = stop.rig_suitability?.toLowerCase()
      if (rigSuit === "4wd") {
        rejectionReasons["rig_suitability"] = (rejectionReasons["rig_suitability"] || 0) + 1
        return false
      }
    }

    // Rule 2 — Road suitability: gravel/4WD tracks excluded if avoid_gravel_roads
    if (trip.avoid_gravel_roads) {
      const roadSuit = stop.road_suitability?.toLowerCase()
      if (roadSuit === "gravel" || roadSuit === "4wd") {
        rejectionReasons["gravel_roads"] = (rejectionReasons["gravel_roads"] || 0) + 1
        return false
      }
    }

    // Rule 3 — Pet friendly: exclude non-pet-friendly stops if required
    if (trip.pet_friendly_required) {
      const pf = stop.pet_friendly?.toLowerCase()
      if (pf && pf !== "yes") {
        rejectionReasons["pet_friendly"] = (rejectionReasons["pet_friendly"] || 0) + 1
        return false
      }
    }

    // Rule 4 — Stay type: filter by stay preference
    if (trip.stay_preference && stayPreferenceMap[trip.stay_preference]) {
      const allowed = stayPreferenceMap[trip.stay_preference]
      const stopStay = stop.stay_type?.toLowerCase().replace(" ", "_")
      if (stopStay && !allowed.includes(stopStay)) {
        rejectionReasons["stay_type"] = (rejectionReasons["stay_type"] || 0) + 1
        return false
      }
    }

    // Rule 5 — Cost band: filter by budget preference
    if (trip.budget_preference === "free") {
      const cb = stop.cost_band?.toLowerCase()
      if (cb && cb !== "free") {
        rejectionReasons["budget_free"] = (rejectionReasons["budget_free"] || 0) + 1
        return false
      }
    } else if (trip.budget_preference === "budget") {
      const cb = stop.cost_band?.toLowerCase()
      if (cb === "premium") {
        rejectionReasons["budget_premium"] = (rejectionReasons["budget_premium"] || 0) + 1
        return false
      }
    }

    // Rule 6 — Max rig length: exclude stops too short for the rig
    if (trip.rig_length_m) {
      const maxLen = stop.max_rig_length
      if (maxLen && maxLen.trim() !== "") {
        const maxLenNum = parseFloat(maxLen)
        if (!isNaN(maxLenNum) && maxLenNum < trip.rig_length_m) {
          rejectionReasons["rig_length"] = (rejectionReasons["rig_length"] || 0) + 1
          return false
        }
      }
    }

    // Rule 7 — Seasonal: exclude stops outside their best season
    if (travelMonth !== null) {
      const bs = stop.best_season
      if (bs && bs.trim() !== "") {
        const season = parseBestSeason(bs)
        if (season && !isMonthInSeason(travelMonth, season)) {
          rejectionReasons["season"] = (rejectionReasons["season"] || 0) + 1
          return false
        }
      }
    }

    return true
  })

  console.log("[stopSuitabilityFilter] FILTER: Results:", {
    inputCount: stops.length,
    outputCount: result.length,
    filteredOutCount: stops.length - result.length,
    rejectionReasons: Object.keys(rejectionReasons).length > 0 ? rejectionReasons : "none",
    tripPreferences: {
      rig_type: trip.rig_type,
      rig_length_m: trip.rig_length_m,
      pet_friendly_required: trip.pet_friendly_required,
      avoid_gravel_roads: trip.avoid_gravel_roads,
      stay_preference: trip.stay_preference,
      budget_preference: trip.budget_preference,
      travelMonth,
    },
    remainingStops: result.slice(0, 5).map(s => ({
      stay_type: s.stay_type,
      cost_band: s.cost_band,
      rig_suitability: s.rig_suitability,
    })),
  })

  return result
}
