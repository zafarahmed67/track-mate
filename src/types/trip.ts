import type { Stop } from "@/lib/types"

export interface TripData {
  id: string
  title: string
  start_location_text: string
  destination_text: string
  start_lat: number | null
  start_lng: number | null
  destination_lat: number | null
  destination_lng: number | null
  status: string
  trip_duration_days: number
  travel_pace: string
  created_at: string
  notes: string | null
  route_data_json?: Record<string, unknown> | null
  end_date?: string | null
  rig_type?: string | null
  rig_length_m?: number | null
  avoid_gravel_roads?: boolean
  pet_friendly_required?: boolean
  total_distance_km?: number
  suggested_days?: number
}

export interface TripStop extends Partial<Stop> {
  id: string
  stop_id?: string
  day_index?: number
  day_order?: number
  is_selected?: boolean
  routeDistance?: number
  distance_to_route_km?: number
  distance_from_start_km?: number
  stop_type?: string
}

export interface FuelStation {
  id?: string
  name: string
  lat: number
  lng: number
  address: string
  isOpenNow?: boolean
  rating?: number
  distanceFromStartKm?: number
}

export interface DrivingInfo {
  totalDistanceKm: number
  totalDurationMinutes: number
}

export interface PaceConfig {
  kmPerDay: number
  hoursPerLeg: number
  minSpacing: number
  maxSpacing: number
}

export interface RouteStopOption {
  id: string
  location_name: string
  latitude?: string
  longitude?: string
  state?: string
  region?: string
  route_type?: string
  stay_type?: string
  pet_friendly?: string
  water?: string
  cost_band?: string
  tier?: string
  is_verified?: boolean
  isRecommended?: boolean
  isDbSource?: boolean
  distance_from_start_km?: number
  distance_to_route_km?: number
  aao_tip?: string
  why_stop_here?: string
  why_we_d_stay_again?: string
  source?: "database" | "google_places"
  is_recommended?: boolean
  road_suitability?: string
}

export interface ActiveItineraryDayRow {
  day_number?: number
  day_order?: number
  source_type?: string
  stop_id?: string | null
  custom_stop_id?: string | null
  is_selected?: boolean
  to_location?: string | null
}

export interface RouteSegment {
  startKm: number
  endKm: number
  verifiedStops: RouteStopOption[]
  otherStops: RouteStopOption[]
  options?: RouteStopOption[]  // 3 options with recommended flag (from API)
  recommendedOption?: RouteStopOption | null  // The recommended stop for this segment
  fuelSuggestions?: FuelStation[]
  primaryFuelSuggestion?: FuelStation
  isRemote?: boolean
  fuelCritical?: boolean
  degradedMode?: boolean
  fuelDistanceIntoLegKm?: number
  gapFromLastFuelKm?: number
  gapToNextFuelKm?: number
  fuelWarning?: string
  // Anchor: the primary overnight stop chosen by the planner for this segment.
  // Used to chain consecutive days: anchorName of day N becomes fromLocation of day N+1.
  overnightAnchorName?: string | null
  overnightAnchorLat?: number | null
  overnightAnchorLng?: number | null
}

export interface DaysAdjustment {
  originalDays: number
  adjustedToDays: number
  reason: string
}

export interface RouteMeta {
  corridor?: string
  drivingInfo?: DrivingInfo
  paceConfig?: PaceConfig
  segments?: RouteSegment[]
  fuelStations?: FuelStation[]
  planningMode?: "standard" | "degraded-valid"
  daysAdjustment?: DaysAdjustment | null
}

export interface DayNarrative {
  dayNumber: number
  narrative: string
  suggestedStay: {
    name: string
    stopType: string
    whyStopHere: string
    aaoTip: string
  } | null
  aaoTips: string[]
  gapNote: string | null
  fuelNote: string | null
}

export interface TripNarrative {
  overview: string
  days: DayNarrative[]
  tripNotes: {
    fuelGuidance: string | null
    remoteWarnings: string | null
    roadConditions: string | null
  } | null
  generatedAt: string
}
