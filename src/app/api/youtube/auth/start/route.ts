import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import {
    createYouTubeAuthorizationUrl,
    isYouTubeOAuthConfigured,
    OAUTH_STATE_COOKIE,
} from "@/lib/youtube-oauth";

export const dynamic = "force-dynamic";

export async function GET() {
    if (!isYouTubeOAuthConfigured()) {
        return NextResponse.json(
            { error: "Google OAuth is not configured on this Fresh Music server" },
            { status: 503 }
        );
    }

    const state = randomBytes(32).toString("base64url");
    const response = NextResponse.redirect(createYouTubeAuthorizationUrl(state));
    response.cookies.set(OAUTH_STATE_COOKIE, state, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.APP_BASE_URL?.startsWith("https://") ?? false,
        path: "/",
        maxAge: 10 * 60,
    });
    return response;
}
