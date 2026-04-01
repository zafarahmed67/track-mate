import { config } from "dotenv"
import path from "path"

config({ path: path.join(process.cwd(), ".env.local") })

import { supabaseAdmin } from "../config/supabase"
import { parse } from "csv-parse/sync"
import fs from "fs"

interface Stop {
  "Location Name": string
  State: string
  Region: string
  "Nearest Town": string
  "Route Type": string
  "Rig Suitability": string
  "Access Type": string
  Water: string
  "Dump Point": string
  "Pet Friendly": string
  "Best Season": string
  "Stay Type": string
  "Why We'd Stay Again": string
  "Confidence Level": string
  Tier: string
  "AAO Tip": string
  "Why Stop Here": string
  "Best Travel Window": string
  Latitude: string
  Longitude: string
  Corridor: string
  "Road Suitability": string
  "Max Rig Length": string
  "Cost Band": string
  "Verification Status": string
}

async function insertStops(stops: Stop[], client = supabaseAdmin) {
  if (!client) {
    throw new Error("Supabase admin client not initialized")
  }

  const records = stops.map((stop) => ({
    location_name: stop["Location Name"] || null,
    state: stop.State || null,
    region: stop.Region || null,
    nearest_town: stop["Nearest Town"] || null,
    route_type: stop["Route Type"] || null,
    rig_suitability: stop["Rig Suitability"] || null,
    access_type: stop["Access Type"] || null,
    water: stop.Water || null,
    dump_point: stop["Dump Point"] || null,
    pet_friendly: stop["Pet Friendly"] || null,
    best_season: stop["Best Season"] || null,
    stay_type: stop["Stay Type"] || null,
    why_we_d_stay_again: stop["Why We'd Stay Again"] || null,
    confidence_level: stop["Confidence Level"] || null,
    tier: stop.Tier || null,
    aao_tip: stop["AAO Tip"] || null,
    why_stop_here: stop["Why Stop Here"] || null,
    best_travel_window: stop["Best Travel Window"] || null,
    latitude: stop.Latitude || null,
    longitude: stop.Longitude || null,
    corridor: stop.Corridor || null,
    road_suitability: stop["Road Suitability"] || null,
    max_rig_length: stop["Max Rig Length"] || null,
    cost_band: stop["Cost Band"] || null,
    verification_status: stop["Verification Status"] || null,
  }))

  const batchSize = 100
  let inserted = 0

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize)
    const { error } = await client.from("stops").insert(batch)

    if (error) {
      console.error("Insert error:", error)
      throw error
    }

    inserted += batch.length
    console.log(`Inserted ${inserted}/${records.length} records...`)
  }

  return inserted
}

async function main() {
  if (!supabaseAdmin) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is not set in .env.local")
    process.exit(1)
  }

  const csvPath = path.join(process.cwd(), "stops.csv")

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`)
    console.log("Please place your stops.csv file in the project root")
    process.exit(1)
  }

  console.log("Reading CSV file...")
  const fileContent = fs.readFileSync(csvPath, "utf-8")

  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Stop[]

  console.log(`Found ${records.length} records`)

  console.log("Inserting records...")
  const count = await insertStops(records)
  console.log(`Successfully imported ${count} stops!`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
