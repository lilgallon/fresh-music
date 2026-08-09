import { NextResponse } from "next/server";
import { AppSettings, getSettings, saveSettings } from "@/lib/repository";
import { validateAppSettings } from "@/lib/settings-validation";

export const dynamic = "force-dynamic";

export async function GET() {
    return NextResponse.json(getSettings());
}

export async function PUT(req: Request) {
    const body = await req.json();

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
        return NextResponse.json({ error: "Body must be a settings object" }, { status: 400 });
    }

    const candidate = { ...getSettings(), ...body } as AppSettings;
    const errors = validateAppSettings(candidate);
    if (errors.length > 0) {
        return NextResponse.json({ error: errors[0], errors }, { status: 400 });
    }

    const settings = saveSettings(candidate);
    const { reschedulePlaylistScheduler } = await import("@/lib/playlist-scheduler");
    reschedulePlaylistScheduler();
    return NextResponse.json(settings);
}
