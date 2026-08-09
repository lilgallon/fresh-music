import { NextResponse } from "next/server";
import {
    getYouTubeIntegrationPublicStatus,
    recreateYouTubePlaylist,
} from "@/lib/youtube-integration-service";

export const dynamic = "force-dynamic";

export async function POST() {
    try {
        await recreateYouTubePlaylist();
        return NextResponse.json(getYouTubeIntegrationPublicStatus());
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Could not recreate the playlist" },
            { status: 503 }
        );
    }
}
