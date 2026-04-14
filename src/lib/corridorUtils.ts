import { supabaseAdmin } from "@/config/supabase"

interface CorridorPoint {
    lat: number;
    lng: number;
}

export interface CorridorCenter {
    lat: number;
    lng: number;
}

let cachedCorridors: Record<string, CorridorCenter> | null = null

export async function getCorridorsFromStops(): Promise<Record<string, CorridorCenter>> {
    if (cachedCorridors) {
        return cachedCorridors
    }

    if (!supabaseAdmin) {
        console.error("Database not configured")
        return {}
    }

    const { data: stops, error } = await supabaseAdmin
        .from("stops")
        .select("corridor, latitude, longitude")
        .not("corridor", "is", null)
        .not("corridor", "eq", "")
        .not("latitude", "is", null)
        .not("longitude", "is", null)

    if (error || !stops) {
        console.error("Failed to fetch corridors from stops:", error)
        return {}
    }

    const corridorCenters: Record<string, { latSum: number; lngSum: number; count: number }> = {}

    for (const stop of stops) {
        const corridor = stop.corridor?.trim()
        if (!corridor) continue

        const lat = parseFloat(stop.latitude)
        const lng = parseFloat(stop.longitude)
        if (!isFinite(lat) || !isFinite(lng)) continue

        if (!corridorCenters[corridor]) {
            corridorCenters[corridor] = { latSum: 0, lngSum: 0, count: 0 }
        }
        corridorCenters[corridor].latSum += lat
        corridorCenters[corridor].lngSum += lng
        corridorCenters[corridor].count += 1
    }

    const result: Record<string, CorridorCenter> = {}
    for (const [corridor, data] of Object.entries(corridorCenters)) {
        if (data.count > 0) {
            result[corridor] = {
                lat: data.latSum / data.count,
                lng: data.lngSum / data.count,
            }
        }
    }

    cachedCorridors = result
    console.log(`🛣️ Loaded ${Object.keys(result).length} corridors from stops table`)
    return result
}

export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
}

export function clearCorridorCache(): void {
    cachedCorridors = null
}