import { NextRequest, NextResponse } from "next/server";
import { YouTubeApiError, YouTubeWriteBudgetError } from "@/lib/youtube-api-server";
import { YouTubeAuthorizationError } from "@/lib/youtube-oauth";
import { youtubeVideoRatingActions } from "@/lib/youtube-video-rating";
import type { YouTubeRating } from "@/types/youtube-rating";

export const dynamic = "force-dynamic";

function parseRating(value: unknown): YouTubeRating | null {
    return value === "like" || value === "dislike" || value === "none" ? value : null;
}
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
        { error: error instanceof Error ? error.message : "Could not undo the YouTube like" },
        { status: 503 }
    );
}

export async function POST(
    request: NextRequest,
    { params }: { params: { videoId: string } }
) {
    const body = await request.json().catch(() => null) as { previousRating?: unknown } | null;
    const previousRating = parseRating(body?.previousRating);
    if (!previousRating) {
        return NextResponse.json({ error: "A valid previousRating is required" }, { status: 400 });
    }

    try {
        await youtubeVideoRatingActions.undoLike(params.videoId, previousRating);
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error(`Failed to undo YouTube like for ${params.videoId}:`, error);
        return errorResponse(error);
    }
}
