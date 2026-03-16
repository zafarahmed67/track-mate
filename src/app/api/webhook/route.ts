import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
    const body = await req.json()

    const { name, email } = body;

    console.log("Webhook received:", name, email);

    return NextResponse.json({ success: true });
}