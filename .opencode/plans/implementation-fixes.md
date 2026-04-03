# Trip Planner — Implementation Plan

## P1: Fix Inverted Fuel Safety Logic (CRITICAL)

### File: `src/app/api/stops/options/route.ts`

**Line ~473** — First fuel pass loop:
```ts
// BEFORE (inverted — gets MORE permissive going north):
const fuelSafeKm = clamp(230 - northWeight * 70, 150, 230)

// AFTER (gets TIGHTER going north/remote):
const fuelSafeKm = clamp(230 - northWeight * 80, 150, 230)
```

**Line ~577** — Unfueled segments refill loop:
```ts
// BEFORE:
const fuelSafeKm = clamp(230 - northWeight * 70, 150, 230)

// AFTER:
const fuelSafeKm = clamp(230 - northWeight * 80, 150, 230)
```

**Line ~623** — Second pass fuel gap calculation:
```ts
// BEFORE:
const fuelSafeKm = clamp(230 - northWeight * 70, 150, 230)

// AFTER:
const fuelSafeKm = clamp(230 - northWeight * 80, 150, 230)
```

**Add hard cap warning** — After line ~673 (end of second pass loop), add:
```ts
// Hard cap: warn if any inter-segment fuel gap exceeds safe threshold
for (let i = 0; i < segments.length; i++) {
  const seg = segments[i]
  if (seg.gapFromLastFuelKm && seg.gapFromLastFuelKm > 350) {
    console.warn(`[Fuel Safety] Segment ${i + 1}: fuel gap ${seg.gapFromLastFuelKm} km exceeds 350 km hard cap`)
  }
  if (seg.gapToNextFuelKm && seg.gapToNextFuelKm > 350) {
    console.warn(`[Fuel Safety] Segment ${i + 1}: next fuel gap ${seg.gapToNextFuelKm} km exceeds 350 km hard cap`)
  }
}
```

### File: `src/app/planner/[tripId]/page.tsx`

**Line ~1568** — `getFuelGapInfo` function:
```ts
// BEFORE:
const fuelSafeKm = clamp(230 - northWeight * 70, 150, 230)

// AFTER:
const fuelSafeKm = clamp(230 - northWeight * 80, 150, 230)
```

---

## P2: Make Planning Controls Actually Work

### File: `src/app/planner/[tripId]/page.tsx`

**Line ~1611-1621** — `loadRouteOptions` function, update the POST body:
```ts
// BEFORE:
const response = await fetch("/api/stops/options", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    startLat: trip.start_lat,
    startLng: trip.start_lng,
    destLat: trip.destination_lat,
    destLng: trip.destination_lng,
    travelPace: trip.travel_pace || "moderate",
    tripId,
  }),
})

// AFTER:
const response = await fetch("/api/stops/options", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    startLat: trip.start_lat,
    startLng: trip.start_lng,
    destLat: trip.destination_lat,
    destLng: trip.destination_lng,
    travelPace: trip.travel_pace || "moderate",
    tripId,
    preferredLegKm: preferredLegLengthKm,
    preferVerified: preferVerifiedStops,
    includeFreeCamps: includeFreeCamps,
  }),
})
```

**Lines ~2726-2735** — Pace buttons should call `loadRouteOptions()` instead of just showing toast:
```tsx
// BEFORE:
onClick={() => toast(`Selected ${pace}`)}

// AFTER: Need to add a pace setter. Add a state:
const [selectedPace, setSelectedPace] = useState(trip?.travel_pace || "moderate")

// And update the onClick:
onClick={() => {
  setSelectedPace(pace)
  // Reload with new pace
  loadRouteOptionsWithPace(pace)
}}

// Add a new function:
const loadRouteOptionsWithPace = async (pace: string) => {
  if (!trip?.start_lat || !trip?.start_lng || !trip?.destination_lat || !trip?.destination_lng) return
  setRouteOptionsLoading(true)
  try {
    const response = await fetch("/api/stops/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startLat: trip.start_lat,
        startLng: trip.start_lng,
        destLat: trip.destination_lat,
        destLng: trip.destination_lng,
        travelPace: pace,
        tripId,
        preferredLegKm: preferredLegLengthKm,
        preferVerified: preferVerifiedStops,
        includeFreeCamps: includeFreeCamps,
      }),
    })
    const data = await response.json()
    if (data.success) {
      setRouteMeta({
        corridor: data.corridor,
        drivingInfo: data.drivingInfo,
        paceConfig: data.paceConfig,
        segments: data.segments,
        fuelStations: data.fuelStations,
        planningMode: data.planningMode,
      })
    }
  } catch (error) {
    console.error("Error loading route options:", error)
  } finally {
    setRouteOptionsLoading(false)
  }
}
```

### File: `src/app/api/stops/options/route.ts`

**After line ~190** — Use `preferredLegKm` to override pace config:
```ts
// Add after the config line:
const effectiveKmPerDay = (typeof preferredLegKm === "number" && preferredLegKm > 0)
  ? clamp(preferredLegKm, 100, 400)
  : config.kmPerDay

// Then use effectiveKmPerDay instead of config.kmPerDay in:
// Line 286: suggestedDays calculation
// Line 290: targetLegKm
// Line 291-292: minLegKm, maxLegKm
```

**In segment stop selection** — Use `preferVerified` to boost verified stops:
```ts
// Around lines 335-344, modify ranking when preferVerified is true:
let verifiedInSegment = rankStops(
  inRangeUnused.filter((s) => s.is_verified),
  midKm,
  preferVerified ? 6 : 4  // pull more verified when toggled on
)
let otherInSegment = rankStops(
  inRangeUnused.filter((s) => !s.is_verified),
  midKm,
  preferVerified ? 3 : 5  // pull fewer non-verified when toggled on
)
```

**Use `includeFreeCamps` to filter stop types:**
```ts
// Around line 329, add free camp filtering:
let inRange = stopsWithDistance.filter(
  (s) => s.distance_from_start_km >= (startKm - 35) && s.distance_from_start_km <= (endKm + 35)
)

if (!includeFreeCamps) {
  // Exclude free camp types when toggle is off
  const freeCampTypes = ["free camp", "free_camp", "rest area"]
  inRange = inRange.filter((s) => !freeCampTypes.includes((s.stay_type || "").toLowerCase()))
}

const inRangeUnused = inRange.filter((s) => !usedStopIds.has(s.id))
```

---

## P3: Show All Planned Days on Fresh Routes

### File: `src/app/planner/[tripId]/page.tsx`

**Lines ~470-481** — Replace effectiveDayCount logic:
```ts
// BEFORE:
const savedRouteStopsCount = stops.filter((stop) => stop.verification_status !== "custom").length
const maxCustomDayIndex = stops
  .filter((s) => s.verification_status === "custom" && typeof s.day_index === "number")
  .reduce((max, s) => Math.max(max, s.day_index as number), -1)
const effectiveDayCount = Math.max(
  1,
  Math.min(
    allDaySegments.length,
    Math.max(savedRouteStopsCount + 1, maxCustomDayIndex >= 0 ? maxCustomDayIndex + 1 : 0)
  )
)
const daySegments = allDaySegments.slice(0, effectiveDayCount)

// AFTER:
const savedRouteStopsCount = stops.filter((stop) => stop.verification_status !== "custom").length
const maxCustomDayIndex = stops
  .filter((s) => s.verification_status === "custom" && typeof s.day_index === "number")
  .reduce((max, s) => Math.max(max, s.day_index as number), -1)

const plannedDays = allDaySegments.length
const effectiveDayCount = savedRouteStopsCount === 0
  ? plannedDays  // fresh route: show all planned days
  : Math.max(1, Math.min(plannedDays, Math.max(savedRouteStopsCount + 1, maxCustomDayIndex >= 0 ? maxCustomDayIndex + 1 : 0)))
const daySegments = allDaySegments.slice(0, effectiveDayCount)
```

---

## P4: Guarantee Minimum 2-3 Stop Options Per Segment

### File: `src/app/api/stops/options/route.ts`

**Lines ~348-370** — Replace fallback logic:
```ts
// BEFORE:
if (verifiedInSegment.length < 2) {
  const fallbackVerified = rankStops(
    stopsWithDistance.filter((s) => s.is_verified && !usedStopIds.has(s.id)),
    midKm,
    4
  ).filter((s) => !verifiedInSegment.some((v) => v.id === s.id))
  verifiedInSegment = [...verifiedInSegment, ...fallbackVerified].slice(0, 4)
}

if ((verifiedInSegment.length + otherInSegment.length) < 3) {
  const fallbackOthers = rankStops(stopsWithDistance, midKm, 6).filter(
    (s) =>
      !usedStopIds.has(s.id) &&
      !verifiedInSegment.some((v) => v.id === s.id) &&
      !otherInSegment.some((o) => o.id === s.id)
  )
  otherInSegment = [...otherInSegment, ...fallbackOthers].slice(0, 6)
}

if ((verifiedInSegment.length + otherInSegment.length) === 0) {
  degradedMode = true
  otherInSegment = rankStops(stopsWithDistance, midKm, 3)
}

// AFTER:
// Lower threshold: trigger fallback when we have fewer than 1 verified (not < 2)
if (verifiedInSegment.length < 1) {
  const fallbackVerified = rankStops(
    stopsWithDistance.filter((s) => s.is_verified && !usedStopIds.has(s.id)),
    midKm,
    8  // larger fallback pool
  ).filter((s) => !verifiedInSegment.some((v) => v.id === s.id))
  verifiedInSegment = [...verifiedInSegment, ...fallbackVerified].slice(0, 4)
}

// Ensure at least 2 total options
if ((verifiedInSegment.length + otherInSegment.length) < 2) {
  const fallbackOthers = rankStops(stopsWithDistance, midKm, 8).filter(  // larger pool
    (s) =>
      !usedStopIds.has(s.id) &&
      !verifiedInSegment.some((v) => v.id === s.id) &&
      !otherInSegment.some((o) => o.id === s.id)
  )
  otherInSegment = [...otherInSegment, ...fallbackOthers].slice(0, 6)
}

// After all fallbacks, guarantee minimum 2 options by pulling from global pool
const totalOptions = verifiedInSegment.length + otherInSegment.length
if (totalOptions < 2) {
  const globalFallback = rankStops(
    stopsWithDistance.filter((s) => !usedStopIds.has(s.id)),
    midKm,
    10
  ).filter(
    (s) =>
      !verifiedInSegment.some((v) => v.id === s.id) &&
      !otherInSegment.some((o) => o.id === s.id)
  )
  const needed = 2 - (verifiedInSegment.length + otherInSegment.length)
  otherInSegment = [...otherInSegment, ...globalFallback.slice(0, needed)]
}

if ((verifiedInSegment.length + otherInSegment.length) === 0) {
  degradedMode = true
  otherInSegment = rankStops(stopsWithDistance, midKm, 5)  // increased from 3
}
```

---

## P5: Shorten Leg Targets in Remote/Northern Sections

### File: `src/app/api/stops/options/route.ts`

**Lines ~290-292** — Add remote multiplier to target leg distance:
```ts
// BEFORE:
const targetLegKm = clamp(config.kmPerDay, 150, 250)
const minLegKm = clamp(targetLegKm - 50, 140, 220)
const maxLegKm = clamp(targetLegKm + 50, 220, 340)

// AFTER:
const remoteMultiplier = northbound ? clamp(1.0 - ((destLat - startLat) > 5 ? 0.25 : 0), 0.75, 1.0) : 1.0
const effectiveKmPerDay = effectiveKmPerDayBase * remoteMultiplier
const targetLegKm = clamp(effectiveKmPerDay, 100, 250)
const minLegKm = clamp(targetLegKm - 50, 100, 220)
const maxLegKm = clamp(targetLegKm + 50, 180, 340)
```

Also update `buildAdaptiveBoundaries` call to use the remote-adjusted values:
```ts
// Lines ~296-303:
let boundaries = buildAdaptiveBoundaries(
  totalDistanceKm,
  targetLegKm,      // already remote-adjusted
  minLegKm,         // already remote-adjusted
  maxLegKm,         // already remote-adjusted
  stopDistances,
  northbound
)
```

Also update `buildAdaptiveBoundaries` function itself to tighten in remote areas:
```ts
// Inside buildAdaptiveBoundaries, lines ~117-119:
// BEFORE:
const targetKm = baseTargetKm + northWeight * 35
const minKm = clamp(baseMinKm + northWeight * 20, 140, 260)
const maxKm = clamp(baseMaxKm + northWeight * 90, 220, 430)

// AFTER:
const targetKm = baseTargetKm - northWeight * 25  // tighten, don't stretch
const minKm = clamp(baseMinKm - northWeight * 10, 100, 260)  // allow shorter minimums
const maxKm = clamp(baseMaxKm + northWeight * 40, 220, 380)  // smaller max stretch
```

---

## Verification Checklist

After implementing all fixes:

1. Load a fresh Brisbane → Cape York trip — all planned days should show immediately without saving any stops
2. Toggle "Prefer verified stops" → rebuild plan → Options lists should show more verified stops first
3. Set leg length to 150 km → rebuild → days should have shorter legs
4. Check Route health "Longest fuel gap" — should never exceed ~350 km for this route
5. Verify fuel warnings appear BEFORE remote Cape York section (Laura, Weipa) not after
6. Check that Day N distances in remote northern section are shorter than Day 1–2 coastal distances
7. Each day segment should show at least 2 stop options (not just 1)
