import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/config/supabase"

export async function POST(req: NextRequest) {
    try {
        // Shared secret validation (SRS §8.3)
        const secret = req.headers.get("x-webhook-secret")
        const expectedSecret = process.env.WEBHOOK_SECRET
        if (!expectedSecret || secret !== expectedSecret) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
        }

        if (!supabaseAdmin) {
            return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
        }

        const body = await req.json()

        console.log("Received webhook body:", body)

        const data = {
            contactId: body.contactId,
            sourceOrderId: body.id || body.order?.interProductId || null,
            firstName: body.first_name,
            lastName: body.last_name,
            fullName: body.full_name,
            email: body.email,
            phone: body.phone,
            tags: body.tags,
            timezone: body.timezone,
            createdAt: body.created_at,
            companyName: body.company_name,
            contactType: body.contact_type,
            location: {
                name: body.location?.name,
                address: body.location?.address,
                city: body.location?.city,
                state: body.location?.state,
                postalCode: body.location?.postalCode,
                country: body.location?.country,
                fullAddress: body.location?.fullAddress,
                id: body.location?.id,
            },
            order: {
                funnelId: body.order?.funnelId,
                pageId: body.order?.pageId,
                interProductId: body.order?.interProductId,
                interPriceId: body.order?.interPriceId,
                productId: body.order?.productId,
                productName: body.order?.productName,
                amount: body.order?.amount,
                quantity: body.order?.quantity,
                currency: body.order?.currency,
                paymentMethod: body.order?.paymentMethod,
                submissionType: body.order?.submissionType,
            },
            workflow: {
                id: body.workflow?.id,
                name: body.workflow?.name,
            }
        }

        console.log("Webhook received:", data)

        if (!data.email) {
            return NextResponse.json({ success: false, error: "Email is required" }, { status: 400 })
        }

        // Idempotency check — prevent duplicate processing of retried webhooks (SRS §8.2)
        if (data.sourceOrderId) {
            const { data: existingPurchase } = await supabaseAdmin
                .from("purchases")
                .select("id")
                .eq("source_order_id", data.sourceOrderId)
                .single()

            if (existingPurchase) {
                console.log("Duplicate webhook call detected for order:", data.sourceOrderId)
                return NextResponse.json({ success: true, message: "Already processed", duplicate: true })
            }
        }

        // Try to find user by contact_id first, then fall back to email.
        // Users who logged in via magic link before purchasing have no contact_id set yet.
        let { data: existingUser } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("contact_id", data.contactId)
            .single()

        if (!existingUser && data.email) {
            const { data: emailUser } = await supabaseAdmin
                .from("users")
                .select("id")
                .eq("email", data.email)
                .single()
            existingUser = emailUser
        }

        let userId: string

        if (existingUser) {
            const { data: updatedUser, error: updateError } = await supabaseAdmin
                .from("users")
                .update({
                    contact_id: data.contactId,
                    first_name: data.firstName,
                    last_name: data.lastName,
                    full_name: data.fullName,
                    phone: data.phone,
                    tags: data.tags || [],
                    timezone: data.timezone,
                    company_name: data.companyName,
                    contact_type: data.contactType,
                    location: data.location,
                    order_data: data.order,
                    workflow: data.workflow,
                    access_status: "active",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", existingUser.id)
                .select("id")
                .single()

            if (updateError) {
                console.error("Error updating user:", updateError)
                return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
            }

            userId = updatedUser.id


        } else {
            const { data: newUser, error: insertError } = await supabaseAdmin
                .from("users")
                .insert({
                    email: data.email,
                    contact_id: data.contactId,
                    first_name: data.firstName,
                    last_name: data.lastName,
                    full_name: data.fullName,
                    phone: data.phone,
                    tags: data.tags || [],
                    timezone: data.timezone,
                    company_name: data.companyName,
                    contact_type: data.contactType,
                    location: data.location,
                    order_data: data.order,
                    workflow: data.workflow,
                    access_status: "active",
                })
                .select("id")
                .single()

            if (insertError) {
                console.error("Error inserting user:", insertError)
                return NextResponse.json({ success: false, error: insertError.message }, { status: 500 })
            }

            userId = newUser.id


        }

        // Record the purchase (SRS §10 purchases table)
        await supabaseAdmin
            .from("purchases")
            .insert({
                user_id: userId,
                source_order_id: data.sourceOrderId,
                source: "fabfunnels",
                product_name: data.order.productName || "TrackMate",
                payment_status: data.order.submissionType === "Sale" ? "paid" : data.order.submissionType || "paid",
                processed_at: new Date().toISOString(),
            })

        const { data: magicLinkData, error: magicLinkError } = await supabaseAdmin.auth.admin.generateLink({
            email: data.email,
            type: "magiclink",
        })

        if (magicLinkError) {
            console.error("Error generating magic link:", magicLinkError)
            return NextResponse.json({ success: false, error: magicLinkError.message }, { status: 500 })
        }

        console.log('Generated magic link:', magicLinkData.properties.action_link);

        const magicLink = magicLinkData.properties.action_link

        const webhookResponse = {
            success: true,
            userId,
            magicLink,
            aigenmagiclink: magicLink,
            message: "User saved and magic link sent to email"
        }

        console.log("Webhook response:", webhookResponse)

        return NextResponse.json(webhookResponse)
    } catch (error) {
        console.error("Webhook error:", error)
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
    }
}
