import { NextRequest, NextResponse } from "next/server";
import { listCatalogVideos } from "@/lib/catalog-repository";
import { getSettings } from "@/lib/repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const tab = request.nextUrl.searchParams.get("tab") === "history" ? "history" : "new";
    const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 50)));
    const offset = Math.max(0, Number(request.nextUrl.searchParams.get("cursor") ?? 0));
    return NextResponse.json(listCatalogVideos(tab, getSettings(), limit, offset));
}
