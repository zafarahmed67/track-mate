/**
 * Shared route-polyline utilities.
 *
 * Using the actual Google Directions polyline for all geometric calculations
 * rather than straight-line projections fixes stop filtering, fuel probe
 * positioning, and day-distance accuracy for non-straight routes (e.g. coastal
 * highways that diverge significantly from the start→destination straight line).
 */

export type PolylinePoint = { lat: number; lng: number }

// ---------------------------------------------------------------------------
// 1. Decode a Google Maps encoded polyline string into lat/lng pairs.
// ---------------------------------------------------------------------------
export function decodePolyline(encoded: string): PolylinePoint[] {
  const poly: PolylinePoint[] = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    let b
    let shift = 0
    let result = 0

    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)

    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1
    lat += dlat

    shift = 0
    result = 0

    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)

    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1
    lng += dlng

    poly.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }

  return poly
}

// ---------------------------------------------------------------------------
// 2. Haversine distance between two points (km).
// ---------------------------------------------------------------------------
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ---------------------------------------------------------------------------
// 3. Build a cumulative-distance lookup table for a decoded polyline.
//    cumTable[i] = total driving km from polyline[0] to polyline[i].
// ---------------------------------------------------------------------------
export function buildCumulativeDistanceTable(polyline: PolylinePoint[]): number[] {
  const cumTable: number[] = [0]
  for (let i = 1; i < polyline.length; i++) {
    const prev = polyline[i - 1]
    const curr = polyline[i]
    cumTable.push(cumTable[i - 1] + haversineKm(prev.lat, prev.lng, curr.lat, curr.lng))
  }
  return cumTable
}

// ---------------------------------------------------------------------------
// 4. Project a point onto the polyline using proper segment projection.
//
//    Returns:
//      distanceFromStartKm — actual driving km from the polyline start to the
//                            foot of the perpendicular on the nearest segment.
//      lateralKm           — perpendicular distance from the point to the
//                            polyline (i.e. how far off-road the point is).
//
//    Uses equirectangular projection for stable local vector math (same
//    approach as the existing options/route.ts filter loop).
// ---------------------------------------------------------------------------
export function projectPointOntoPolyline(
  lat: number,
  lng: number,
  polyline: PolylinePoint[],
  cumTable: number[]
): { distanceFromStartKm: number; lateralKm: number } {
  if (polyline.length < 2) {
    const d = haversineKm(lat, lng, polyline[0].lat, polyline[0].lng)
    return { distanceFromStartKm: 0, lateralKm: d }
  }

  let bestLateralKm = Infinity
  let bestDistanceFromStartKm = 0

  for (let i = 0; i < polyline.length - 1; i++) {
    const p1 = polyline[i]
    const p2 = polyline[i + 1]

    // Equirectangular local projection — accurate for the short segments of a
    // Google polyline (typically <100 km each).
    const avgLatRad = ((p1.lat + p2.lat) / 2) * Math.PI / 180
    const scaleX = Math.cos(avgLatRad)

    const sx = p1.lng * scaleX
    const sy = p1.lat
    const ex = p2.lng * scaleX
    const ey = p2.lat
    const px = lng * scaleX
    const py = lat

    const vx = ex - sx
    const vy = ey - sy
    const wx = px - sx
    const wy = py - sy
    const vLenSq = vx * vx + vy * vy

    const tRaw = vLenSq > 1e-12 ? (wx * vx + wy * vy) / vLenSq : 0
    const t = Math.max(0, Math.min(1, tRaw))

    // Foot of the perpendicular (clamped to the segment).
    const footLat = p1.lat + t * (p2.lat - p1.lat)
    const footLng = p1.lng + t * (p2.lng - p1.lng)

    const lateralKm = haversineKm(lat, lng, footLat, footLng)

    if (lateralKm < bestLateralKm) {
      bestLateralKm = lateralKm
      // Along-route distance: cum distance to p1 + fraction of segment length.
      const segmentLengthKm = cumTable[i + 1] - cumTable[i]
      bestDistanceFromStartKm = cumTable[i] + t * segmentLengthKm
    }
  }

  return {
    distanceFromStartKm: Math.round(bestDistanceFromStartKm * 10) / 10,
    lateralKm: Math.round(bestLateralKm * 10) / 10,
  }
}

// ---------------------------------------------------------------------------
// 5. Sample a point on the actual road at exactly `targetKm` along the route.
//
//    Uses binary search for efficiency on long polylines (~700+ points for a
//    2500 km route at Google's default density).
//
//    Returns the interpolated lat/lng on the polyline at that distance.
// ---------------------------------------------------------------------------
export function samplePolylineAtKm(
  targetKm: number,
  polyline: PolylinePoint[],
  cumTable: number[]
): PolylinePoint {
  if (polyline.length === 0) return { lat: 0, lng: 0 }
  if (polyline.length === 1) return polyline[0]

  const totalKm = cumTable[cumTable.length - 1]
  const clampedTarget = Math.max(0, Math.min(totalKm, targetKm))

  // Binary search for the segment bracket.
  let lo = 0
  let hi = cumTable.length - 2

  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cumTable[mid + 1] < clampedTarget) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }

  const segStart = cumTable[lo]
  const segEnd = cumTable[lo + 1]
  const segLen = segEnd - segStart

  const t = segLen > 1e-9 ? (clampedTarget - segStart) / segLen : 0

  const p1 = polyline[lo]
  const p2 = polyline[lo + 1]

  return {
    lat: p1.lat + t * (p2.lat - p1.lat),
    lng: p1.lng + t * (p2.lng - p1.lng),
  }
}
