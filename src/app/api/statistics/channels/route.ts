import { NextResponse } from "next/server";
import { getChannelStatisticsResponse } from "@/lib/channel-statistics";

export const dynamic = "force-dynamic";

export async function GET() {
    return NextResponse.json(getChannelStatisticsResponse());
}
