import { NextRequest, NextResponse } from "next/server";
import { markWatched, unmarkWatched } from "@/lib/repository";
import {
    removeWatchedVideoFromYouTubePlaylist,
    requeueVideoInYouTubePlaylist,
} from "@/lib/playlist-sync";

export const dynamic = "force-dynamic";

export async function POST(
    _req: NextRequest,
    { params }: { params: { videoId: string } }
) {
    markWatched(params.videoId);
    await removeWatchedVideoFromYouTubePlaylist(params.videoId);
    return new NextResponse(null, { status: 204 });
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: { videoId: string } }
) {
    unmarkWatched(params.videoId);
    await requeueVideoInYouTubePlaylist(params.videoId);
    return new NextResponse(null, { status: 204 });
}
