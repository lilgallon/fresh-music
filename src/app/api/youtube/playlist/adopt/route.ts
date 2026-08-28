import { NextResponse } from "next/server";
import {
    adoptExistingYouTubePlaylistEntries,
    getYouTubeIntegrationPublicStatus,
} from "@/lib/youtube-integration-service";

export const dynamic = "force-dynamic";

export async function POST() {
    try {
        await adoptExistingYouTubePlaylistEntries();
        return NextResponse.json(getYouTubeIntegrationPublicStatus());
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Could not manage existing playlist videos" },
            { status: 503 }
        );
    }
}
