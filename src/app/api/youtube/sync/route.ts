import { NextResponse } from "next/server";
import { requestYouTubeSync } from "@/lib/youtube-sync-manager";

export const dynamic = "force-dynamic";

export async function POST() {
    const result = requestYouTubeSync("manual", true);
    return NextResponse.json(result, { status: result.started ? 202 : 200 });
}
