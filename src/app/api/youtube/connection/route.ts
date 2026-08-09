import { NextResponse } from "next/server";
import {
    disconnectYouTubeAccount,
    getYouTubeIntegrationPublicStatus,
} from "@/lib/youtube-integration-service";

export const dynamic = "force-dynamic";

export async function GET() {
    return NextResponse.json(getYouTubeIntegrationPublicStatus());
}

export async function DELETE() {
    await disconnectYouTubeAccount();
    return NextResponse.json(getYouTubeIntegrationPublicStatus());
}
