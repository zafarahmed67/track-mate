import { supabaseAdmin } from "@/config/supabase"

export async function logAdminAction(
  userId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown> | null = null
) {
  if (!supabaseAdmin) return

  try {
    await supabaseAdmin.from("admin_audit_logs").insert({
      actor_user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details_json: details ?? {},
    })
  } catch (error) {
    console.error("Failed to write audit log:", error)
  }
}
