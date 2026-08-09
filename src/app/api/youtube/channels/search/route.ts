import { NextRequest, NextResponse } from "next/server";
import { searchYouTubeChannels } from "@/lib/youtube-catalog-discovery";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (query.length < 2) return NextResponse.json([]);
    try {
        return NextResponse.json(await searchYouTubeChannels(query.slice(0, 100)));
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "YouTube channel search failed" },
            { status: 503 }
        );
    }
}
