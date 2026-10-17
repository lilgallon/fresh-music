import "server-only";

import {
    claimYouTubeReauthorizationNotification,
    releaseYouTubeReauthorizationNotification,
} from "./youtube-integration-repository";

const GOTIFY_TIMEOUT_MS = 10_000;

export interface GotifyMessage {
    title: string;
    message: string;
    priority?: number;
    clickUrl?: string;
}

export function isGotifyConfigured(): boolean {
    return Boolean(process.env.GOTIFY_URL?.trim() && process.env.GOTIFY_TOKEN?.trim());
}

/** Sends a Gotify message. Returns false when Gotify is not configured or the push fails. */
export async function sendGotifyNotification(
    { title, message, priority = 8, clickUrl }: GotifyMessage,
    fetchImpl: typeof fetch = fetch
): Promise<boolean> {
    const baseUrl = process.env.GOTIFY_URL?.trim().replace(/\/$/, "");
    const token = process.env.GOTIFY_TOKEN?.trim();
    if (!baseUrl || !token) return false;

    try {
        const response = await fetchImpl(`${baseUrl}/message`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Gotify-Key": token },
            body: JSON.stringify({
                title,
                message,
                priority,
                ...(clickUrl
                    ? { extras: { "client::notification": { click: { url: clickUrl } } } }
                    : {}),
            }),
            signal: AbortSignal.timeout(GOTIFY_TIMEOUT_MS),
        });
        if (!response.ok) {
            console.error(`Gotify notification failed with HTTP ${response.status}`);
            return false;
        }
        return true;
    } catch (error) {
        console.error("Gotify notification failed:", error);
        return false;
    }
}

/** Notifies once per connection that the Google authorization must be renewed. */
export async function notifyYouTubeReauthorizationRequired(): Promise<void> {
    if (!isGotifyConfigured() || !claimYouTubeReauthorizationNotification()) return;

    const baseUrl = process.env.APP_BASE_URL?.trim().replace(/\/$/, "");
    const settingsUrl = baseUrl ? `${baseUrl}/settings` : undefined;
    const sent = await sendGotifyNotification({
        title: "Fresh Music — reconnexion Google requise",
        message: settingsUrl
            ? `L'autorisation YouTube a expiré. Reconnecte ton compte : ${settingsUrl}`
            : "L'autorisation YouTube a expiré. Reconnecte ton compte depuis les paramètres.",
        clickUrl: settingsUrl,
    });
    // Let the next synchronization retry if Gotify was unreachable.
    if (!sent) releaseYouTubeReauthorizationNotification();
}
