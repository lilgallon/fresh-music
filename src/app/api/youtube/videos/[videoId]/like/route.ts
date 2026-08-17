import { NextRequest, NextResponse } from "next/server";
import { YouTubeApiError, YouTubeWriteBudgetError } from "@/lib/youtube-api-server";
import { YouTubeAuthorizationError } from "@/lib/youtube-oauth";
import { youtubeVideoRatingActions } from "@/lib/youtube-video-rating";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
    if (error instanceof YouTubeAuthorizationError) {
        return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof YouTubeWriteBudgetError) {
        return NextResponse.json({ error: error.message }, { status: 429 });
    }
    if (error instanceof YouTubeApiError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not like the YouTube video" },
        { status: 503 }
    );
}
export async function POST(
    _request: NextRequest,
    { params }: { params: { videoId: string } }
) {
    try {
        return NextResponse.json(await youtubeVideoRatingActions.like(params.videoId));
    } catch (error) {
        console.error(`Failed to like YouTube video ${params.videoId}:`, error);
        return errorResponse(error);
    }
}
