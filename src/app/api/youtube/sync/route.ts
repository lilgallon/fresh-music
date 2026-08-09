import { NextResponse } from "next/server";
import { synchronizeYouTubePlaylist } from "@/lib/playlist-sync";
import { getYouTubeIntegrationPublicStatus } from "@/lib/youtube-integration-service";

export const dynamic = "force-dynamic";

export async function POST() {
    try {
        const result = await synchronizeYouTubePlaylist();
        return NextResponse.json({ result, status: getYouTubeIntegrationPublicStatus() });
    } catch (error) {
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : "YouTube synchronization failed",
                status: getYouTubeIntegrationPublicStatus(),
            },
            { status: 503 }
        );
    }
}
