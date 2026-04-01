import { supabaseAdmin } from "@/config/supabase"
import { NextRequest, NextResponse } from "next/server"

const TRAVEL_PACES = new Set(["leisurely", "moderate", "fast"])
const STAY_PREFERENCES = new Set(["any", "free-camps", "caravan-parks", "mix"])
const BUDGET_PREFERENCES = new Set(["any", "free", "budget", "mid-range"])

interface UserMetadata {
  defaults?: {
    travelPace?: string | null
    rigType?: string | null
    rigLengthM?: number | null
    petFriendlyRequired?: boolean
    avoidGravelRoads?: boolean
    stayPreference?: string | null
    budgetPreference?: string | null
  }
  [key: string]: unknown
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function GET(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
      )
    }

    const { searchParams } = new URL(req.url)
    const userId = searchParams.get("user_id")

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "user_id is required" },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from("users")
      .select(
        "id, email, first_name, last_name, phone, timezone, metadata"
      )
      .eq("id", userId)
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({
          success: true,
          settings: {
            id: userId,
            email: null,
            first_name: null,
            last_name: null,
            phone: null,
            timezone: null,
            default_travel_pace: null,
            default_rig_type: null,
            default_rig_length_m: null,
            default_pet_friendly_required: false,
            default_avoid_gravel_roads: false,
            default_stay_preference: null,
            default_budget_preference: null,
          },
        })
      }
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    const metadata = (data.metadata as UserMetadata | null) ?? {}
    const defaults = metadata.defaults ?? {}

    return NextResponse.json({
      success: true,
      settings: {
        id: data.id,
        email: data.email,
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone,
        timezone: data.timezone,
        default_travel_pace: defaults.travelPace ?? null,
        default_rig_type: defaults.rigType ?? null,
        default_rig_length_m: defaults.rigLengthM ?? null,
        default_pet_friendly_required: defaults.petFriendlyRequired ?? false,
        default_avoid_gravel_roads: defaults.avoidGravelRoads ?? false,
        default_stay_preference: defaults.stayPreference ?? null,
        default_budget_preference: defaults.budgetPreference ?? null,
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

export async function PATCH(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
      )
    }

    const body = await req.json()
    const userId = body.userId as string | undefined
    const email = normalizeString(body.email)

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId is required" },
        { status: 400 }
      )
    }

    const { data: userRow, error: userFetchError } = await supabaseAdmin
      .from("users")
      .select("id, metadata")
      .eq("id", userId)
      .single()

    if (userFetchError && userFetchError.code !== "PGRST116") {
      return NextResponse.json(
        { success: false, error: userFetchError.message },
        { status: 500 }
      )
    }

    const updates: Record<string, unknown> = {}
    const metadata = (userRow?.metadata as UserMetadata | null) ?? {}
    const defaults = {
      travelPace: metadata.defaults?.travelPace ?? null,
      rigType: metadata.defaults?.rigType ?? null,
      rigLengthM: metadata.defaults?.rigLengthM ?? null,
      petFriendlyRequired: metadata.defaults?.petFriendlyRequired ?? false,
      avoidGravelRoads: metadata.defaults?.avoidGravelRoads ?? false,
      stayPreference: metadata.defaults?.stayPreference ?? null,
      budgetPreference: metadata.defaults?.budgetPreference ?? null,
    }

    if ("firstName" in body) {
      updates.first_name = normalizeString(body.firstName)
    }
    if ("lastName" in body) {
      updates.last_name = normalizeString(body.lastName)
    }
    if ("phone" in body) {
      updates.phone = normalizeString(body.phone)
    }
    if ("timezone" in body) {
      updates.timezone = normalizeString(body.timezone)
    }

    if ("defaultTravelPace" in body) {
      const pace = normalizeString(body.defaultTravelPace)
      if (pace && !TRAVEL_PACES.has(pace)) {
        return NextResponse.json(
          { success: false, error: "Invalid travel pace" },
          { status: 400 }
        )
      }
      defaults.travelPace = pace
    }

    if ("defaultRigType" in body) {
      defaults.rigType = normalizeString(body.defaultRigType)
    }

    if ("defaultRigLengthM" in body) {
      if (body.defaultRigLengthM === null || body.defaultRigLengthM === "") {
        defaults.rigLengthM = null
      } else {
        const numericLength = Number(body.defaultRigLengthM)
        if (!Number.isFinite(numericLength) || numericLength <= 0 || numericLength > 30) {
          return NextResponse.json(
            { success: false, error: "Rig length must be between 0 and 30 meters" },
            { status: 400 }
          )
        }
        defaults.rigLengthM = numericLength
      }
    }

    if ("defaultPetFriendlyRequired" in body) {
      defaults.petFriendlyRequired = Boolean(body.defaultPetFriendlyRequired)
    }

    if ("defaultAvoidGravelRoads" in body) {
      defaults.avoidGravelRoads = Boolean(body.defaultAvoidGravelRoads)
    }

    if ("defaultStayPreference" in body) {
      const stayPreference = normalizeString(body.defaultStayPreference)
      if (stayPreference && !STAY_PREFERENCES.has(stayPreference)) {
        return NextResponse.json(
          { success: false, error: "Invalid stay preference" },
          { status: 400 }
        )
      }
      defaults.stayPreference = stayPreference
    }

    if ("defaultBudgetPreference" in body) {
      const budgetPreference = normalizeString(body.defaultBudgetPreference)
      if (budgetPreference && !BUDGET_PREFERENCES.has(budgetPreference)) {
        return NextResponse.json(
          { success: false, error: "Invalid budget preference" },
          { status: 400 }
        )
      }
      defaults.budgetPreference = budgetPreference
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: "No settings provided" },
        { status: 400 }
      )
    }

    updates.metadata = {
      ...metadata,
      defaults,
    }
    updates.updated_at = new Date().toISOString()

    let data
    let error

    if (!userRow) {
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("users")
        .insert({
          id: userId,
          email: email ?? `user-${userId}@trackmate.local`,
          role: "customer",
          metadata: updates.metadata,
          first_name: updates.first_name ?? null,
          last_name: updates.last_name ?? null,
          phone: updates.phone ?? null,
          timezone: updates.timezone ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id, email, first_name, last_name, phone, timezone, metadata")
        .single()

      data = inserted
      error = insertError
    } else {
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("users")
        .update(updates)
        .eq("id", userId)
        .select(
          "id, email, first_name, last_name, phone, timezone, metadata"
        )
        .single()

      data = updated
      error = updateError
    }

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: "Failed to persist settings" },
        { status: 500 }
      )
    }

    const savedMetadata = (data.metadata as UserMetadata | null) ?? {}
    const savedDefaults = savedMetadata.defaults ?? {}

    return NextResponse.json({
      success: true,
      settings: {
        id: data.id,
        email: data.email,
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone,
        timezone: data.timezone,
        default_travel_pace: savedDefaults.travelPace ?? null,
        default_rig_type: savedDefaults.rigType ?? null,
        default_rig_length_m: savedDefaults.rigLengthM ?? null,
        default_pet_friendly_required: savedDefaults.petFriendlyRequired ?? false,
        default_avoid_gravel_roads: savedDefaults.avoidGravelRoads ?? false,
        default_stay_preference: savedDefaults.stayPreference ?? null,
        default_budget_preference: savedDefaults.budgetPreference ?? null,
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
