export interface Stop {
  id: string
  location_name: string
  state: string
  region: string
  nearest_town: string
  route_type: string
  rig_suitability: string
  access_type: string
  water: string
  dump_point: string
  pet_friendly: string
  best_season: string
  stay_type: string
  why_we_d_stay_again: string
  confidence_level: string
  tier: string
  aao_tip: string
  why_stop_here: string
  best_travel_window: string
  latitude: string
  longitude: string
  corridor: string
  road_suitability: string
  max_rig_length: string
  cost_band: string
  verification_status: string
  created_at: string
}

export interface User {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  timezone: string | null
  default_travel_pace: "leisurely" | "moderate" | "fast" | null
  default_rig_type: string | null
  default_rig_length_m: number | null
  default_pet_friendly_required: boolean
  default_avoid_gravel_roads: boolean
  default_stay_preference: string | null
  default_budget_preference: string | null
  role: "customer" | "admin"
  created_at: string
}

export interface Trip {
  id: string
  user_id: string
  status: "planned" | "in_progress" | "completed" | "cancelled"
  title: string
  start_location_text: string
  destination_text: string
  start_lat: number | null
  start_lng: number | null
  destination_lat: number | null
  destination_lng: number | null
  trip_duration_days: number
  travel_pace: "leisurely" | "moderate" | "fast"
  rig_type: string | null
  rig_length_m: number | null
  pet_friendly_required: boolean
  stay_preference: string | null
  avoid_gravel_roads: boolean
  budget_preference: string | null
  planner_input_json: Record<string, unknown>
  route_data_json: Record<string, unknown>
  notes: string | null
  end_date: string | null
  created_at: string
  updated_at: string
}

export type TravelPace = "leisurely" | "moderate" | "fast"