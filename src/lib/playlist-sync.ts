import "server-only";

import { getSettings, listChannels, listWatched, markWatched } from "./repository";
import {
    activateYouTubePlaylistEntry,
    finishYouTubeSync,
    getYouTubeIntegration,
    getYouTubePlaylistEntry,
    listYouTubePlaylistEntries,
    markYouTubePlaylistEntryRemoved,
    prepareYouTubePlaylistEntry,
    requestYouTubePlaylistRemoval,
    setYouTubePlaylistEntryError,
    startYouTubeSync,
} from "./youtube-integration-repository";
import { getYouTubeAccessToken } from "./youtube-oauth";
import { youtubeGateway } from "./youtube-api-server";
import { createPlaylistSyncRunner } from "./playlist-sync-core";

export function getPlaylistSyncIntervalMs(): number {
    const configured = Number(process.env.PLAYLIST_SYNC_INTERVAL_MINUTES ?? 60);
    const minutes = Number.isFinite(configured)
        ? Math.min(1440, Math.max(5, Math.round(configured)))
        : 60;
    return minutes * 60 * 1000;
}

const store = {
    getIntegration: getYouTubeIntegration,
    listChannels,
    listWatched,
    markWatched,
    getSettings,
    listEntries: listYouTubePlaylistEntries,
    prepareEntry: prepareYouTubePlaylistEntry,
    activateEntry: activateYouTubePlaylistEntry,
    markEntryRemoved: markYouTubePlaylistEntryRemoved,
    setEntryError: setYouTubePlaylistEntryError,
    startSync: startYouTubeSync,
    finishSync: finishYouTubeSync,
};

export const synchronizeYouTubePlaylist = createPlaylistSyncRunner({
    store,
    youtube: youtubeGateway,
    getAccessToken: getYouTubeAccessToken,
    now: Date.now,
    intervalMs: getPlaylistSyncIntervalMs(),
});

function isMissingRemoteItemError(error: unknown): boolean {
    const apiError = error as { status?: number; reason?: string | null };
    return apiError.status === 404 || apiError.reason === "videoNotFound";
}

export async function removeWatchedVideoFromYouTubePlaylist(videoId: string): Promise<void> {
    requestYouTubePlaylistRemoval(videoId);
    const integration = getYouTubeIntegration();
    const entry = getYouTubePlaylistEntry(videoId);
    if (!integration?.encryptedRefreshToken || !integration.playlistId || !entry?.managedByApp) return;
    if (entry.state !== "removal_pending") return;

    try {
        if (entry.playlistItemId) {
            const accessToken = await getYouTubeAccessToken();
            await youtubeGateway.deletePlaylistItem(accessToken, entry.playlistItemId);
        }
        markYouTubePlaylistEntryRemoved(videoId, "watched");
    } catch (error) {
        if (isMissingRemoteItemError(error)) {
            markYouTubePlaylistEntryRemoved(videoId, "watched");
            return;
        }
        setYouTubePlaylistEntryError(
            videoId,
            error instanceof Error ? error.message : "Could not remove the video from YouTube"
        );
        console.error(`Failed to remove ${videoId} from the YouTube playlist; it will be retried:`, error);
    }
}

export async function requeueVideoInYouTubePlaylist(videoId: string): Promise<void> {
    const integration = getYouTubeIntegration();
    const existing = getYouTubePlaylistEntry(videoId);
    if (!integration?.encryptedRefreshToken || !integration.playlistId) return;

    if (existing) {
        prepareYouTubePlaylistEntry({
            videoId,
            sourceChannelId: existing.sourceChannelId,
            publishedAt: existing.publishedAt,
            managedByApp: true,
        });
    }

    try {
        const accessToken = await getYouTubeAccessToken();
        const remoteItems = await youtubeGateway.listPlaylistItems(accessToken, integration.playlistId);
        const remote = remoteItems.find((item) => item.videoId === videoId);
        if (remote) {
            activateYouTubePlaylistEntry({
                videoId,
                playlistItemId: remote.id,
                managedByApp: existing?.managedByApp ?? false,
                sourceChannelId: existing?.sourceChannelId,
                publishedAt: existing?.publishedAt,
            });
            return;
        }

        if (!existing) {
            // A full sync will add it if it is still inside the configured discovery window.
            await synchronizeYouTubePlaylist();
            return;
        }

        const playlistItemId = await youtubeGateway.insertPlaylistItem(
            accessToken,
            integration.playlistId,
            videoId
        );
        activateYouTubePlaylistEntry({
            videoId,
            playlistItemId,
            managedByApp: true,
            sourceChannelId: existing.sourceChannelId,
            publishedAt: existing.publishedAt,
        });
    } catch (error) {
        if (existing) {
            setYouTubePlaylistEntryError(
                videoId,
                error instanceof Error ? error.message : "Could not re-add the video to YouTube"
            );
        }
        console.error(`Failed to re-add ${videoId} to the YouTube playlist; it will be retried:`, error);
    }
}
