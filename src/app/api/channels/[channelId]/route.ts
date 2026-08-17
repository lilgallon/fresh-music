import { NextRequest, NextResponse } from "next/server";
import { deleteChannel, upsertChannel } from "@/lib/repository";

export const dynamic = "force-dynamic";

export async function POST(
    req: NextRequest,
    { params }: { params: { channelId: string } }
) {
    const body = await req.json();
    if (typeof body?.name !== "string") {
        return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    upsertChannel({
        channelId: params.channelId,
        name: body.name,
        isMusicOnly: body.isMusicOnly !== false,
        thumbnail: typeof body.thumbnail === "string" ? body.thumbnail : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
    });
    const { requestYouTubeSync } = await import("@/lib/youtube-sync-manager");
    requestYouTubeSync("manual", true);
    return new NextResponse(null, { status: 204 });
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: { channelId: string } }
) {
    deleteChannel(params.channelId);
    const { requestYouTubeSync } = await import("@/lib/youtube-sync-manager");
    requestYouTubeSync("manual", true);
    return new NextResponse(null, { status: 204 });
}
