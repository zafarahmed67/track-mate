import { supabaseAdmin } from "@/config/supabase"
import { NextRequest, NextResponse } from "next/server"
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer"
import { createElement, type ReactElement, type JSXElementConstructor } from "react"
import { TripPdfDocument, type PdfTrip } from "@/lib/trip-pdf"

interface RouteParams {
  params: Promise<{ tripId: string }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
      )
    }

    const { tripId } = await params
    const { searchParams } = new URL(req.url)
    const format = searchParams.get("format") || "json"
    const userId = searchParams.get("user_id")

    if (!tripId || !userId) {
      return NextResponse.json(
        { success: false, error: "trip_id and user_id are required" },
        { status: 400 }
      )
    }

    const { data: trip, error: tripError } = await supabaseAdmin
      .from("trips")
      .select("*")
      .eq("id", tripId)
      .eq("user_id", userId)
      .single()

    if (tripError) {
      console.error("Database error:", tripError)
      return NextResponse.json(
        { success: false, error: tripError.message },
        { status: 500 }
      )
    }

    const { data: stops, error: stopsError } = await supabaseAdmin
      .from("trip_candidate_stops")
      .select(`
        *,
        stop:stops(*)
      `)
      .eq("trip_id", tripId)
      .order("rank_score", { ascending: false })

    if (stopsError) {
      console.error("Database error:", stopsError)
      return NextResponse.json(
        { success: false, error: stopsError.message },
        { status: 500 }
      )
    }

    // Fetch the active AI-generated narrative for this trip
    const { data: itineraryRecord } = await supabaseAdmin
      .from("trip_itineraries")
      .select("itinerary_json, trip_snapshot_json")
      .eq("trip_id", tripId)
      .eq("status", "active")
      .order("version", { ascending: false })
      .limit(1)
      .single()

    const narrative = itineraryRecord?.itinerary_json as {
      overview?: string
      days?: Array<{
        dayNumber: number
        narrative: string
        suggestedStay: { name: string; stopType: string; whyStopHere: string; aaoTip: string } | null
        aaoTips: string[]
        gapNote: string | null
        fuelNote: string | null
      }>
      tripNotes?: { fuelGuidance: string | null; remoteWarnings: string | null; roadConditions: string | null }
    } | null

    const exportData = {
      trip: {
        ...trip,
        stops: stops.map((s) => ({
          id: s.id,
          ...s.stop,
          distance_to_route_km: s.distance_to_route_km,
          rank_score: s.rank_score,
        })),
      },
      exportedAt: new Date().toISOString(),
    }

    if (format === "pdf") {
      const pdfTrip: PdfTrip = {
        title: trip.title,
        start_location_text: trip.start_location_text,
        destination_text: trip.destination_text,
        trip_duration_days: trip.trip_duration_days,
        travel_pace: trip.travel_pace,
        rig_type: trip.rig_type ?? null,
        rig_length_m: trip.rig_length_m ?? null,
        pet_friendly_required: trip.pet_friendly_required ?? false,
        avoid_gravel_roads: trip.avoid_gravel_roads ?? false,
        stay_preference: trip.stay_preference ?? null,
        budget_preference: trip.budget_preference ?? null,
        notes: trip.notes ?? null,
        narrative: narrative ?? undefined,
        stops: stops.map((s) => ({
          id: s.id,
          location_name: s.stop?.location_name ?? "",
          state: s.stop?.state,
          nearest_town: s.stop?.nearest_town,
          stay_type: s.stop?.stay_type,
          why_stop_here: s.stop?.why_stop_here,
          aao_tip: s.stop?.aao_tip,
          road_suitability: s.stop?.road_suitability,
          pet_friendly: s.stop?.pet_friendly,
          cost_band: s.stop?.cost_band,
          water: s.stop?.water,
          distance_to_route_km: s.distance_to_route_km,
        })),
        exportedAt: new Date().toISOString(),
      }

      const element = createElement(TripPdfDocument, { trip: pdfTrip }) as ReactElement<
        DocumentProps,
        string | JSXElementConstructor<unknown>
      >
      const buffer = await renderToBuffer(element)
      const uint8 = new Uint8Array(buffer)

      const slug = (trip.title || "trip")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")

      return new NextResponse(uint8, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${slug}.pdf"`,
        },
      })
    }

    if (format === "html") {
      const html = generateTripHtml(exportData)
      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html",
        },
      })
    }

    return NextResponse.json({
      success: true,
      data: exportData,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}

function generateTripHtml(data: { trip: Record<string, unknown>; exportedAt: string }) {
  const trip = data.trip as {
    title: string
    start_location_text: string
    destination_text: string
    trip_duration_days: number
    travel_pace: string
    status: string
    created_at: string
    notes: string | null
    stops: Array<{
      location_name: string
      state: string
      stop_type: string
      address: string
      latitude: string
      longitude: string
    }>
  }

  const daysCount = trip.trip_duration_days || 1
  const stopsPerDay = Math.ceil((trip.stops?.length || 0) / daysCount)

  let stopsHtml = ""
  if (trip.stops && trip.stops.length > 0) {
    for (let day = 1; day <= daysCount; day++) {
      const dayStops = trip.stops.slice((day - 1) * stopsPerDay, day * stopsPerDay)
      
      let dayContent = ""
      if (day === 1) {
        dayContent = `
          <div class="day-header">Day ${day}: ${trip.start_location_text}</div>
          <div class="day-subtitle">Departure</div>
        `
      } else if (day === daysCount) {
        dayContent = `
          <div class="day-header">Day ${day}: ${trip.destination_text}</div>
          <div class="day-subtitle">Arrival</div>
        `
      } else if (dayStops.length > 0) {
        dayContent = `
          <div class="day-header">Day ${day}</div>
          ${dayStops.map((stop) => `
            <div class="stop">
              <strong>${stop.location_name}</strong><br>
              <span class="stop-type">${stop.stop_type}</span><br>
              ${stop.address || ""}
            </div>
          `).join("")}
        `
      }

      if (dayContent) {
        stopsHtml += `<div class="day">${dayContent}</div>`
      }
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${trip.title || "Trip"}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a1a1a; border-bottom: 2px solid #2563eb; padding-bottom: 10px; }
    .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0; }
    .meta-item { background: #f5f5f5; padding: 10px; border-radius: 8px; }
    .meta-label { font-size: 12px; color: #666; }
    .meta-value { font-size: 18px; font-weight: bold; }
    .section { margin: 30px 0; }
    .section-title { font-size: 20px; color: #2563eb; margin-bottom: 15px; }
    .day { background: #fafafa; padding: 15px; margin: 15px 0; border-radius: 8px; border-left: 4px solid #2563eb; }
    .day-header { font-size: 18px; font-weight: bold; }
    .day-subtitle { color: #666; font-size: 14px; }
    .stop { padding: 10px 0; border-bottom: 1px solid #eee; }
    .stop:last-child { border-bottom: none; }
    .stop-type { background: #e0e7ff; color: #3730a3; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
    .notes { background: #fffbeb; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b; }
    .footer { margin-top: 40px; text-align: center; color: #999; font-size: 12px; }
    @media print {
      body { padding: 0; }
      .day { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>${trip.title || "Trip Itinerary"}</h1>
  
  <div class="meta">
    <div class="meta-item">
      <div class="meta-label">Route</div>
      <div class="meta-value">${trip.start_location_text || "-"} → ${trip.destination_text || "-"}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Duration</div>
      <div class="meta-value">${trip.trip_duration_days || 0} days</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Pace</div>
      <div class="meta-value">${trip.travel_pace || "Moderate"}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Day-by-Day Itinerary</div>
    ${stopsHtml}
  </div>

  ${trip.notes ? `
  <div class="section">
    <div class="section-title">Trip Notes</div>
    <div class="notes">${trip.notes}</div>
  </div>
  ` : ""}

  <div class="footer">
    Exported from TrackMate on ${new Date(data.exportedAt).toLocaleDateString()}
  </div>
</body>
</html>`
}
