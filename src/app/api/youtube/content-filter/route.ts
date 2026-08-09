import { NextRequest, NextResponse } from "next/server";
import {
    findIgnoredYouTubeVideoIds,
    normalizeContentFilterRules,
    parseIsoDurationSeconds,
    YouTubeVideoMetadata,
} from "@/lib/youtube-content-filter";
import { getSettings } from "@/lib/repository";
import { isYouTubeShortCached } from "@/lib/youtube-short-cache";

export const dynamic = "force-dynamic";

interface VideosResponse {
    items?: Array<{
        id: string;
        contentDetails?: { duration?: string };
        snippet?: {
            title?: string;
            liveBroadcastContent?: "live" | "upcoming" | "none";
        };
        liveStreamingDetails?: object;
    }>;
}

export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => null) as {
        videoIds?: unknown;
        rules?: unknown;
    } | null;
    const videoIds = Array.isArray(body?.videoIds)
        ? body.videoIds.filter((id): id is string =>
            typeof id === "string" && /^[A-Za-z0-9_-]{11}$/.test(id)
        ).slice(0, 50)
        : [];
    if (videoIds.length === 0) return NextResponse.json({ ignoredVideoIds: [] });

    const apiKey = process.env.YOUTUBE_API_KEY || process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "YOUTUBE_API_KEY is not configured" }, { status: 503 });

    const response = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet,liveStreamingDetails&id=${encodeURIComponent(videoIds.join(","))}&key=${encodeURIComponent(apiKey)}`,
        { cache: "no-store" }
    );
    if (!response.ok) {
        return NextResponse.json({ error: "Could not inspect YouTube videos" }, { status: 502 });
    }

    const data = await response.json() as VideosResponse;
    const metadata: YouTubeVideoMetadata[] = (data.items ?? []).map((item) => ({
        id: item.id,
        title: item.snippet?.title ?? "",
        durationSeconds: item.contentDetails?.duration
            ? parseIsoDurationSeconds(item.contentDetails.duration)
            : null,
        liveBroadcastContent: item.snippet?.liveBroadcastContent ?? null,
        hasLiveStreamingDetails: item.liveStreamingDetails != null,
    }));
    const rules = body?.rules
        ? normalizeContentFilterRules(body.rules)
        : getSettings();
    const ignoredVideoIds = await findIgnoredYouTubeVideoIds(
        metadata,
        rules,
        isYouTubeShortCached
    );
    return NextResponse.json({ ignoredVideoIds: Array.from(ignoredVideoIds) });
}
