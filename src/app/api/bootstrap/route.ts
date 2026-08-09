import { NextResponse } from "next/server";
import { bootstrapApplication } from "@/lib/repository";
import { channels as defaultChannels } from "@/config/channels";
import type { AppSettings } from "@/types/settings";
import type { YouTubeChannel } from "@/types/youtube";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    const body = await request.json().catch(() => ({})) as {
        channels?: unknown;
        watchedIds?: unknown;
        settings?: unknown;
    };
    const cachedChannels = Array.isArray(body.channels)
        ? body.channels.filter((channel): channel is YouTubeChannel =>
            Boolean(channel && typeof channel === "object" && typeof channel.channelId === "string")
        )
        : null;
    const cachedWatched = Array.isArray(body.watchedIds)
        ? body.watchedIds.filter((id): id is string => typeof id === "string")
        : null;
    const cachedSettings = body.settings && typeof body.settings === "object" && !Array.isArray(body.settings)
        ? body.settings as Partial<AppSettings>
        : null;

    const result = bootstrapApplication({
        cachedChannels,
        cachedWatched,
        cachedSettings,
        defaultChannels,
    });

    const { requestYouTubeSync } = await import("@/lib/youtube-sync-manager");
    requestYouTubeSync("bootstrap", false);
    return NextResponse.json(result);
}
