import { NextRequest, NextResponse } from "next/server";
import { listChannels, replaceChannels } from "@/lib/repository";
import { YouTubeChannel } from "@/types/youtube";

export const dynamic = "force-dynamic";

export async function GET() {
    return NextResponse.json(listChannels());
}

export async function PUT(req: NextRequest) {
    const body = await req.json();
    if (!Array.isArray(body)) {
        return NextResponse.json({ error: "Body must be an array of channels" }, { status: 400 });
    }
    for (const c of body as YouTubeChannel[]) {
        if (typeof c?.channelId !== "string" || typeof c?.name !== "string") {
            return NextResponse.json({ error: "Invalid channel payload" }, { status: 400 });
        }
    }
    replaceChannels(body as YouTubeChannel[]);
    const { requestYouTubeSync } = await import("@/lib/youtube-sync-manager");
    requestYouTubeSync("manual", true);
    return NextResponse.json(listChannels());
}
