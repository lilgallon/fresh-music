import { NextResponse } from "next/server";
import { AppSettings, getSettings, saveSettings } from "@/lib/repository";

export const dynamic = "force-dynamic";

export async function GET() {
    return NextResponse.json(getSettings());
}

export async function PUT(req: Request) {
    const body = await req.json();

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
        return NextResponse.json({ error: "Body must be a settings object" }, { status: 400 });
    }

    return NextResponse.json(saveSettings(body as Partial<AppSettings>));
}
