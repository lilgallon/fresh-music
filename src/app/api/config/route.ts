import { NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json({
        apiKey: process.env.YOUTUBE_API_KEY || process.env.NEXT_PUBLIC_YOUTUBE_API_KEY || "",
    });
}
