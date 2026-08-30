import { NextRequest, NextResponse } from "next/server";
import { YouTubeApiError } from "@/lib/youtube-api-server";
import { YouTubeAuthorizationError } from "@/lib/youtube-oauth";
import { synchronizeYouTubeRatings } from "@/lib/youtube-rating-sync";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => ({})) as { force?: unknown };
    try {
        return NextResponse.json(await synchronizeYouTubeRatings(body.force === true));
    } catch (error) {
        const status = error instanceof YouTubeAuthorizationError
            ? 401
            : error instanceof YouTubeApiError
                ? error.status
                : 503;
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Could not synchronize YouTube ratings" },
            { status }
        );
    }
}
