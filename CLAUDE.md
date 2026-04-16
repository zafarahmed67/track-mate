# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Dev server: http://localhost:3000
npm run build        # Production build (runs TypeScript type-check)
npm run lint         # ESLint
npx tsc --noEmit     # Type-check only
npm run db:migrate   # Apply Supabase migrations
npm run import:stops # Import stop data from CSV
```

No test suite is configured. Linting is the primary code-quality gate.

## Architecture Overview

**TrackMate Planner** is a Next.js 16 (App Router) trip planner for Australian caravan/RV travelers. It generates multi-day itineraries with curated stop suggestions, fuel planning, and route-based corridor awareness.

### Main Layers

**Frontend** — `src/app/` (pages) + `src/components/` (React 19 + shadcn/Radix UI)
- The main planner UI lives in `src/app/planner/[tripId]/page.tsx` (~4500 lines). It manages the full editor state: trip segments, day boundaries, stop selections, drag-reorder (@dnd-kit), Google Map rendering, and chat messages. All state is local React hooks — no Redux/Zustand.

**API** — `src/app/api/` (27 route handlers)
- `api/trips/route.ts` (~3400 lines) is the core orchestration engine: trip creation, segment generation, narrative generation, and days auto-adjustment.
- `api/stops/options/route.ts` — stop filtering and candidate generation.
- `api/places/*` — Google Maps/Places API wrappers.
- `api/admin/*` — admin stats, stop import, webhooks.

**Database** — Supabase (PostgreSQL) with RLS
- Key tables: `trips`, `stops`, `custom_stops`, `trip_candidate_stops`, `trip_itineraries`, `itinerary_days`, `users`, `purchases`, `trip_messages`, `trip_exports`, `admin_audit_logs`.
- Migrations live in `supabase/migrations/`.

**Config** — `src/config/env.config.ts`
- 54+ environment variables controlling pace thresholds, search radii, fuel gap distances, corridor widths, and spacing. Tune behavior here before touching logic code.

### Data Flow

1. User submits trip form (`/planner/new`) → `POST /api/trips` → creates `trips` row, returns `tripId`.
2. Background processing generates candidate stops:
   - **Phase 1**: Query pre-verified `stops` table (database stops near route).
   - **Phase 2**: Query Google Places for `custom_stops` (fills gaps, deduped against existing).
3. `buildAdaptiveBoundaries()` (`api/trips/route.ts:266–318`) groups stops into day segments based on pace and corridor clustering.
4. **Days auto-adjustment** (`api/trips/route.ts:618–646`): if user-requested days are unrealistic for the distance + pace, system adjusts and returns a `daysAdjustment` flag; the UI shows a Planning Alerts warning.
5. OpenAI (gpt-4o-mini) generates day-by-day narrative text, stored in `trips.route_data_json.narrative`.

### Non-Obvious Design Decisions

**Polyline-based geometry** — `src/lib/routePolyline.ts` decodes Google's encoded polyline and builds a cumulative-distance lookup table. All stop filtering and day-distance calculations use *actual driving distance* along the route, not haversine (crow-flies). This matters a lot on Australia's non-linear coastal highways.

**Two-phase stop generation** — Database stops are pre-verified and high-confidence. Custom stops from Google Places fill spatial gaps. The two sources are kept in separate tables and merged at query time to avoid re-querying Places for known locations.

**Suitability filter is deterministic** — `src/lib/stopSuitabilityFilter.ts` applies hard rules in sequence: rig type → road surface → pet policy → stay type → cost → rig length → seasonal. No LLM scoring; transparent and tunable.

**Dual trip state** — `trips.planner_input_json` stores the user's original inputs; `trips.route_data_json` stores computed outputs (segments, narrative, fuel gaps). Separating them allows recomputation without losing user intent.

**Auth** — Supabase magic-link auth with JWT + refresh token stored in `localStorage`. Client-side checks live in `src/lib/auth.ts`; server-side route protection is in `src/lib/server-auth.ts`. Admin routes additionally call `requireAdmin()`.

**Corridor awareness** — `src/lib/corridorUtils.ts` calculates a center-of-gravity for named geographic corridors to cluster stops meaningfully (avoids splitting a dense region across arbitrary day boundaries).

### Where to Make Changes

| Goal | File(s) |
|------|---------|
| Add a trip field | `src/lib/types.ts` → migration SQL → `api/trips/route.ts` POST handler |
| Modify stop filtering rules | `src/lib/stopSuitabilityFilter.ts` |
| Change day segmentation logic | `api/trips/route.ts:buildAdaptiveBoundaries()` + `src/config/env.config.ts` |
| Tune pace/distance thresholds | `src/config/env.config.ts` (or `.env`) |
| Extend AI narrative | `api/trips/route.ts:generateNarrative()` (OpenAI prompt) |
| Fuel planning | `api/places/fuel-*` routes + planner UI |
| Admin features | `src/app/admin/` + `api/admin/` + `src/lib/server-auth.ts` |

## Key Conventions

- Path alias `@/` maps to `src/` (tsconfig.json).
- Import order: external → internal → types.
- Use `cn()` from `@/lib/utils` for className merging.
- `"use client"` directive required for any component using hooks or browser APIs.
- Strict TypeScript — all code must pass `tsc --noEmit` and `npm run lint` before committing.
- Supabase clients: use `supabase` (public) from `src/config/supabase.ts` for client-side; use `supabaseAdmin` (service role) for server-side API routes only.
