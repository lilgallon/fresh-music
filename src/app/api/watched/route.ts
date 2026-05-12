import { NextRequest, NextResponse } from "next/server";
import { listWatched, replaceWatched } from "@/lib/repository";

export const dynamic = "force-dynamic";

export async function GET() {
    return NextResponse.json(listWatched());
}

export async function PUT(req: NextRequest) {
    const body = await req.json();
    if (!Array.isArray(body) || body.some((id) => typeof id !== "string")) {
        return NextResponse.json({ error: "Body must be an array of video IDs" }, { status: 400 });
    }
    replaceWatched(body as string[]);
    return NextResponse.json(listWatched());
}
