import { supabaseAdmin } from "@/config/supabase"
import { NextRequest, NextResponse } from "next/server"
import { parse } from "csv-parse/sync"
import { requireAdmin } from "@/lib/server-auth"
import { logAdminAction } from "@/lib/audit-log"

interface CsvRow {
  "Location Name"?: string
  State?: string
  Region?: string
  "Nearest Town"?: string
  "Route Type"?: string
  "Rig Suitability"?: string
  "Access Type"?: string
  Water?: string
  "Dump Point"?: string
  "Pet Friendly"?: string
  "Best Season"?: string
  "Stay Type"?: string
  "Why We'd Stay Again"?: string
  "Confidence Level"?: string
  Tier?: string
  "AAO Tip"?: string
  "Why Stop Here"?: string
  "Best Travel Window"?: string
  Latitude?: string
  Longitude?: string
  Corridor?: string
  "Road Suitability"?: string
  "Max Rig Length"?: string
  "Cost Band"?: string
  "Verification Status"?: string
  [key: string]: string | undefined
}

function rowToRecord(row: CsvRow) {
  return {
    location_name: row["Location Name"]?.trim() || null,
    state: row["State"]?.trim() || null,
    region: row["Region"]?.trim() || null,
    nearest_town: row["Nearest Town"]?.trim() || null,
    route_type: row["Route Type"]?.trim() || null,
    rig_suitability: row["Rig Suitability"]?.trim() || null,
    access_type: row["Access Type"]?.trim() || null,
    water: row["Water"]?.trim() || null,
    dump_point: row["Dump Point"]?.trim() || null,
    pet_friendly: row["Pet Friendly"]?.trim() || null,
    best_season: row["Best Season"]?.trim() || null,
    stay_type: row["Stay Type"]?.trim() || null,
    why_we_d_stay_again: row["Why We'd Stay Again"]?.trim() || null,
    confidence_level: row["Confidence Level"]?.trim() || null,
    tier: row["Tier"]?.trim() || null,
    aao_tip: row["AAO Tip"]?.trim() || null,
    why_stop_here: row["Why Stop Here"]?.trim() || null,
    best_travel_window: row["Best Travel Window"]?.trim() || null,
    latitude: row["Latitude"]?.trim() || null,
    longitude: row["Longitude"]?.trim() || null,
    corridor: row["Corridor"]?.trim() || null,
    road_suitability: row["Road Suitability"]?.trim() || null,
    max_rig_length: row["Max Rig Length"]?.trim() || null,
    cost_band: row["Cost Band"]?.trim() || null,
    verification_status: row["Verification Status"]?.trim() || "unverified",
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin()
    if ("error" in adminCheck) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status })
    }
    const adminUser = adminCheck.user

    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
      )
    }

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const mode = (formData.get("mode") as string) || "upsert"

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      )
    }

    if (!file.name.endsWith(".csv")) {
      return NextResponse.json(
        { success: false, error: "File must be a CSV" },
        { status: 400 }
      )
    }

    const text = await file.text()

    let rows: CsvRow[]
    try {
      rows = parse(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as CsvRow[]
    } catch {
      return NextResponse.json(
        { success: false, error: "Failed to parse CSV. Ensure it has a valid header row." },
        { status: 400 }
      )
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "CSV file is empty" },
        { status: 400 }
      )
    }

    // Validate required columns
    const firstRow = rows[0]
    if (!("Location Name" in firstRow)) {
      return NextResponse.json(
        { success: false, error: 'CSV must contain a "Location Name" column' },
        { status: 400 }
      )
    }

    const records = rows
      .filter((r) => r["Location Name"]?.trim())
      .map(rowToRecord)

    if (records.length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid rows found (all rows are missing Location Name)" },
        { status: 400 }
      )
    }

    const skipped = rows.length - records.length
    const batchSize = 100
    let inserted = 0
    let updated = 0
    const errors: string[] = []

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize)

      if (mode === "upsert") {
        // Upsert on location_name + state combination
        const { data, error } = await supabaseAdmin
          .from("stops")
          .upsert(batch, {
            onConflict: "location_name,state",
            ignoreDuplicates: false,
          })
          .select("id")

        if (error) {
          // Fall back to individual inserts to capture per-row errors
          for (const record of batch) {
            const { data: existing } = await supabaseAdmin
              .from("stops")
              .select("id")
              .eq("location_name", record.location_name ?? "")
              .eq("state", record.state ?? "")
              .maybeSingle()

            if (existing) {
              const { error: updateErr } = await supabaseAdmin
                .from("stops")
                .update(record)
                .eq("id", existing.id)
              if (updateErr) {
                errors.push(`Row "${record.location_name}": ${updateErr.message}`)
              } else {
                updated++
              }
            } else {
              const { error: insertErr } = await supabaseAdmin
                .from("stops")
                .insert(record)
              if (insertErr) {
                errors.push(`Row "${record.location_name}": ${insertErr.message}`)
              } else {
                inserted++
              }
            }
          }
        } else {
          inserted += data?.length ?? batch.length
        }
      } else {
        // Insert only — skip duplicates
        const { data, error } = await supabaseAdmin
          .from("stops")
          .insert(batch)
          .select("id")

        if (error) {
          errors.push(`Batch ${i / batchSize + 1}: ${error.message}`)
        } else {
          inserted += data?.length ?? 0
        }
      }
    }

    await logAdminAction(adminUser.id, "stops_imported", "stop", null, {
      mode,
      total_rows: rows.length,
      inserted,
      updated,
      skipped,
      errors: errors.length,
    })

    return NextResponse.json({
      success: true,
      summary: {
        total_rows: rows.length,
        processed: records.length,
        inserted,
        updated,
        skipped,
        errors: errors.length,
        error_details: errors.slice(0, 20),
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
