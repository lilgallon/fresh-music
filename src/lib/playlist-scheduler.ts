import "server-only";

import { getYouTubeIntegration } from "./youtube-integration-repository";
import { getPlaylistSyncIntervalMs, synchronizeYouTubePlaylist } from "./playlist-sync";

declare global {
    // eslint-disable-next-line no-var
    var __freshMusicPlaylistSchedulerStarted: boolean | undefined;
}

async function scheduledSync(): Promise<void> {
    const integration = getYouTubeIntegration();
    if (!integration?.encryptedRefreshToken || !integration.playlistId) return;
    if (
        integration.lastSyncStatus === "reauthorization_required"
        || integration.lastSyncStatus === "playlist_missing"
    ) return;

    try {
        await synchronizeYouTubePlaylist();
    } catch (error) {
        console.error("Scheduled YouTube playlist sync failed:", error);
    }
}

export function startPlaylistScheduler(): void {
    if (globalThis.__freshMusicPlaylistSchedulerStarted) return;
    globalThis.__freshMusicPlaylistSchedulerStarted = true;

    const initialTimer = setTimeout(scheduledSync, 2_000);
    initialTimer.unref();
    const interval = setInterval(scheduledSync, getPlaylistSyncIntervalMs());
    interval.unref();
}
