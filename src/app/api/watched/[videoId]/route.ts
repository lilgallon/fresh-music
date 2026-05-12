import { NextRequest, NextResponse } from "next/server";
import { markWatched, unmarkWatched } from "@/lib/repository";

export const dynamic = "force-dynamic";

export async function POST(
    _req: NextRequest,
    { params }: { params: { videoId: string } }
) {
    markWatched(params.videoId);
    return new NextResponse(null, { status: 204 });
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: { videoId: string } }
) {
    unmarkWatched(params.videoId);
    return new NextResponse(null, { status: 204 });
}
