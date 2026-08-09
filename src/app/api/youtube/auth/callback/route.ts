import { NextRequest, NextResponse } from "next/server";
import {
    exchangeYouTubeAuthorizationCode,
    OAUTH_STATE_COOKIE,
} from "@/lib/youtube-oauth";
import { connectYouTubeAccount } from "@/lib/youtube-integration-service";

export const dynamic = "force-dynamic";

function redirectToSettings(req: NextRequest, result: "connected" | "error", message?: string) {
    const url = new URL("/settings", process.env.APP_BASE_URL ?? req.nextUrl.origin);
    url.searchParams.set("youtube", result);
    if (message) url.searchParams.set("message", message.slice(0, 240));
    const response = NextResponse.redirect(url);
    response.cookies.delete(OAUTH_STATE_COOKIE);
    return response;
}

export async function GET(req: NextRequest) {
    const googleError = req.nextUrl.searchParams.get("error");
    if (googleError) return redirectToSettings(req, "error", `Google authorization failed: ${googleError}`);

    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const expectedState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
    if (!code || !state || !expectedState || state !== expectedState) {
        return redirectToSettings(req, "error", "Invalid or expired Google authorization state");
    }

    try {
        const refreshToken = await exchangeYouTubeAuthorizationCode(code);
        await connectYouTubeAccount(refreshToken);
        return redirectToSettings(req, "connected");
    } catch (error) {
        console.error("YouTube OAuth callback failed:", error);
        return redirectToSettings(
            req,
            "error",
            error instanceof Error ? error.message : "Could not connect the YouTube account"
        );
    }
}
