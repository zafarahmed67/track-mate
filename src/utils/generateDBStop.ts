import { supabaseAdmin } from "@/config/supabase";
import { calculateDistance } from "./calculateDistance";

interface GenerateDBStopResult {
    success: boolean;
    stops: {
        id: string;                           // Unique identifier
        location_name: string;                // Name of the location
        state: string;                        // State where the location is situated
        region: string;                       // Region name
        nearest_town: string;                 // Nearest town
        route_type: string;                   // Type of route (e.g., Inland/Coastal corridor)
        rig_suitability: string;              // Suitability for rigs (e.g., Caravan friendly)
        access_type: string;                  // Type of access (e.g., Sealed access)
        water: string;                        // Availability of water (mentioning potable status)
        dump_point: string;                   // Availability of dump point (e.g., nearby town facilities)
        pet_friendly: string;                 // Whether pets are allowed, with conditions
        best_season: string;                  // Best season to visit
        stay_type: string;                    // Type of stay (e.g., Low-cost, Showgrounds)
        why_we_d_stay_again: string;          // Reason why people choose to stay again
        confidence_level: string;             // Confidence level (e.g., Medium)
        tier: string;                         // Tier number
        aao_tip: string;                      // Additional tips (e.g., Affordable showground camping)
        why_stop_here: string;                // Reasons to stop at this location
        best_travel_window: string;           // Best travel window (e.g., Year-round)
        latitude: number;                     // Latitude of the location
        longitude: number;                    // Longitude of the location
        corridor: string;                     // Corridor the location is part of (e.g., Pacific Highway)
        road_suitability: string;             // Road suitability (e.g., Sealed - All weather)
        max_rig_length: string;               // Maximum rig length (e.g., No limit)
        cost_band: string;                    // Cost range for staying (e.g., $10-20)
        verification_status: string;          // Verification status (e.g., AAO Verified)
        created_at: string;                   // Date and time the entry was created
    }[];
    error?: string;
}

export async function generateDBStop(
    startLat: number,
    startLng: number,
    destLat: number,
    destLng: number,
    travelPace: string = "moderate",
    totalTripDistanceKM: number
): Promise<GenerateDBStopResult> {

    // Step 2: Validate the presence of supabaseAdmin for database access
    if (!supabaseAdmin) {
        return { success: false, stops: [], error: "Database not configured" };
    }

    try {
        // ============================================================
        // Step 3: CONSTANTS - Set strict thresholds based on trip distance
        // ============================================================
        const BOUNDING_BUFFER = 1; // Buffer for lat/lng calculations

        // Evaluate if the trip is considered "long" and heading north
        const isLongTrip = totalTripDistanceKM > 500; // Long trip if distance is more than 500km
        const isNorthbound = destLat > startLat; // Heading north if destination latitude > start latitude
        const isRemote = isLongTrip && isNorthbound;

        // Max lateral (perpendicular) distance from the route a verified stop may be.
        // Remote/northbound long trips allow wider corridors (sparse stop density).
        const MAX_LATERAL_KM_VERIFIED = isRemote ? 50 : 30;

        // ============================================================
        // Step 4: Basic Calculations - Create bounding box for the region
        // ============================================================
        const minLat = Math.min(startLat, destLat) - BOUNDING_BUFFER;
        const maxLat = Math.max(startLat, destLat) + BOUNDING_BUFFER;
        const minLng = Math.min(startLng, destLng) - BOUNDING_BUFFER;
        const maxLng = Math.max(startLng, destLng) + BOUNDING_BUFFER;

        // Step 5: Query database (using supabaseAdmin) to find stops within the bounding box
        const { data, error } = await supabaseAdmin
            .from("stops")
            .select("*")
            .gte("latitude", minLat)
            .lte("latitude", maxLat)
            .gte("longitude", minLng)
            .lte("longitude", maxLng);

        if (error) {
            return { success: false, stops: [], error: `Database error: ${error.message}` };
        }

        // Step 6: Filter by lateral (perpendicular) distance from the route line,
        // not distance from the start point. Uses equirectangular projection onto
        // the start→destination straight line as a fast approximation.
        const avgLatRad = ((startLat + destLat) / 2) * Math.PI / 180
        const scaleX = Math.cos(avgLatRad)
        const vx = (destLng - startLng) * scaleX
        const vy = destLat - startLat
        const vLenSq = vx * vx + vy * vy

        const filteredStops = data.filter(stop => {
            const lat = stop.latitude ?? stop.lat
            const lng = stop.longitude ?? stop.lng
            if (!lat || !lng) return false

            // Project stop onto the start→dest line, clamp to segment.
            const wx = (lng - startLng) * scaleX
            const wy = lat - startLat
            const tRaw = vLenSq > 1e-12 ? (wx * vx + wy * vy) / vLenSq : 0
            if (tRaw < -0.05 || tRaw > 1.05) return false // behind start or past dest

            const tClamped = Math.max(0, Math.min(1, tRaw))
            const projLat = startLat + tClamped * (destLat - startLat)
            const projLng = startLng + tClamped * (destLng - startLng)
            const lateralKm = calculateDistance(lat, lng, projLat, projLng)
            return lateralKm <= MAX_LATERAL_KM_VERIFIED
        });

        // Step 7: Return the result with stops
        return {
            success: true,
            stops: filteredStops,
        };

    } catch (error) {
        console.warn("[generateDBStop] Error:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { success: false, stops: [], error: errorMessage };
    }
}