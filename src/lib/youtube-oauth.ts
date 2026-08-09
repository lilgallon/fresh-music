import "server-only";

import { OAuth2Client } from "google-auth-library";
import { decryptRefreshToken, isTokenEncryptionConfigured } from "./token-crypto";
import { getYouTubeIntegration } from "./youtube-integration-repository";

export const YOUTUBE_OAUTH_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";
export const OAUTH_STATE_COOKIE = "fresh_music_youtube_oauth_state";

export class YouTubeAuthorizationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "YouTubeAuthorizationError";
    }
}

function getRequiredEnv(name: "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "APP_BASE_URL"): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is not configured`);
    return value;
}

export function isYouTubeOAuthConfigured(): boolean {
    return Boolean(
        process.env.GOOGLE_CLIENT_ID?.trim()
        && process.env.GOOGLE_CLIENT_SECRET?.trim()
        && process.env.APP_BASE_URL?.trim()
        && isTokenEncryptionConfigured()
    );
}

export function getYouTubeOAuthRedirectUri(): string {
    return `${getRequiredEnv("APP_BASE_URL").replace(/\/$/, "")}/api/youtube/auth/callback`;
}

export function createYouTubeOAuthClient(): OAuth2Client {
    return new OAuth2Client(
        getRequiredEnv("GOOGLE_CLIENT_ID"),
        getRequiredEnv("GOOGLE_CLIENT_SECRET"),
        getYouTubeOAuthRedirectUri()
    );
}

export function createYouTubeAuthorizationUrl(state: string): string {
    return createYouTubeOAuthClient().generateAuthUrl({
        access_type: "offline",
        include_granted_scopes: true,
        prompt: "consent",
        scope: [YOUTUBE_OAUTH_SCOPE],
        state,
    });
}

export async function exchangeYouTubeAuthorizationCode(code: string): Promise<string> {
    const { tokens } = await createYouTubeOAuthClient().getToken(code);
    if (!tokens.refresh_token) {
        throw new YouTubeAuthorizationError(
            "Google did not return a refresh token. Revoke Fresh Music access and try again."
        );
    }
    return tokens.refresh_token;
}

export async function getYouTubeAccessToken(): Promise<string> {
    const integration = getYouTubeIntegration();
    if (!integration?.encryptedRefreshToken) {
        throw new YouTubeAuthorizationError("No YouTube account is connected");
    }

    try {
        const client = createYouTubeOAuthClient();
        client.setCredentials({
            refresh_token: decryptRefreshToken(integration.encryptedRefreshToken),
        });
        const result = await client.getAccessToken();
        const token = typeof result === "string" ? result : result.token;
        if (!token) throw new Error("Google returned an empty access token");
        return token;
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown OAuth error";
        throw new YouTubeAuthorizationError(`YouTube authorization must be renewed: ${message}`);
    }
}

export async function getAccessTokenFromRefreshToken(refreshToken: string): Promise<string> {
    try {
        const client = createYouTubeOAuthClient();
        client.setCredentials({ refresh_token: refreshToken });
        const result = await client.getAccessToken();
        const token = typeof result === "string" ? result : result.token;
        if (!token) throw new Error("Google returned an empty access token");
        return token;
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown OAuth error";
        throw new YouTubeAuthorizationError(`Could not authorize the YouTube account: ${message}`);
    }
}

export async function revokeYouTubeAuthorization(): Promise<void> {
    const integration = getYouTubeIntegration();
    if (!integration?.encryptedRefreshToken) return;

    const refreshToken = decryptRefreshToken(integration.encryptedRefreshToken);
    try {
        await createYouTubeOAuthClient().revokeToken(refreshToken);
    } catch (error) {
        console.warn("Failed to revoke the Google refresh token; clearing it locally:", error);
    }
}
