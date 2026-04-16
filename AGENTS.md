# Track-Mate Planner - Agent Guidelines

## Build Commands
```bash
npm run dev      # Dev server: http://localhost:3000
npm run build    # Production build (type-checks)
npm run lint    # ESLint
npx tsc --noEmit # Type-check
```

## Project Structure
```
/src
  /app/api/stops/options/route.ts   # Core trip planning logic (route, segments, stops)
  /app/planner/[tripId]/page.tsx   # Main planner UI (4000+ lines)
  /config/env.config.ts           # Pace/km-per-day config (150-400 km range)
```

## Trip Planning - Critical Context

When modifying route/stop generation, the key file is `/src/app/api/stops/options/route.ts`:

### Pace Settings (env.config.ts)
- `leisurely`: 150-200 km/day
- `moderate`: 200-300 km/day
- `fast`: 300-400 km/day

### Important Logic
- **Days auto-adjustment** (route.ts:618-646): If user requests fewer days than realistic for distance + pace, system auto-adjusts to realistic days and returns `daysAdjustment` in response. UI displays warning in Planning Alerts.

- **Segment generation**: Uses `buildAdaptiveBoundaries()` to create day boundaries based on stop clusters and pace settings (route.ts:266-318).

- **Reconciliation**: If adaptive boundaries differ >2x from requested days, falls back to equal-length segments.

## Key Patterns
- Use `@/` path aliases (defined in tsconfig.json)
- External imports → internal imports → types
- "use client" directive for interactive components
- `cn()` from `@/lib/utils` for className merging
- Strict TypeScript enabled - all code must pass

## Database
- Supabase for persistence
- Tables: trips, stops, custom_stops, trip_candidate_stops

---

Last updated: 2026-04-16
