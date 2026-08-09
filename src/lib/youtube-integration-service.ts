import "server-only";

import { encryptRefreshToken } from "./token-crypto";
import {
    clearYouTubePlaylist,
    disconnectYouTube,
    getYouTubeIntegration,
    resetYouTubePlaylistEntries,
    saveYouTubeConnection,
    saveYouTubePlaylist,
} from "./youtube-integration-repository";
import {
    getAccessTokenFromRefreshToken,
    getYouTubeAccessToken,
    isYouTubeOAuthConfigured,
    revokeYouTubeAuthorization,
} from "./youtube-oauth";
import { FRESH_MUSIC_PLAYLIST_TITLE, youtubeGateway } from "./youtube-api-server";
import { requestYouTubeSync } from "./youtube-sync-manager";
import {
    findExistingFreshMusicPlaylist,
    resolveFreshMusicPlaylist,
} from "./youtube-playlist-resolution";
import { YouTubeIntegrationPublicStatus } from "@/types/youtube-integration";
import { getLastCatalogDiscoveryAt, isApplicationInitialized } from "./catalog-repository";
import { getLastSuccessfulSyncAt, getLatestSyncRun } from "./sync-run-repository";
import { getYouTubeQuotaStatus, pauseYouTubeQuota } from "./youtube-quota";
import { getSettings } from "./repository";
import { isYouTubeQuotaExceededError } from "./youtube-quota-error";
import { getYouTubeQuotaDay } from "./youtube-quota-time";

function toIso(timestamp: number | null): string | null {
    return timestamp == null ? null : new Date(timestamp).toISOString();
}

export function getYouTubeIntegrationPublicStatus(): YouTubeIntegrationPublicStatus {
    const integration = getYouTubeIntegration();
    const playlist = integration?.playlistId
        ? {
            id: integration.playlistId,
            title: integration.playlistTitle ?? "Fresh Music — Nouveautés",
            youtubeUrl: `https://www.youtube.com/playlist?list=${encodeURIComponent(integration.playlistId)}`,
            youtubeMusicUrl: `https://music.youtube.com/playlist?list=${encodeURIComponent(integration.playlistId)}`,
        }
        : null;

    const latestRun = getLatestSyncRun();
    let quota = getYouTubeQuotaStatus();
    const recordedErrors = [
        { message: latestRun?.error, timestamp: latestRun?.completedAt },
        { message: integration?.lastSyncError, timestamp: integration?.lastSyncCompletedAt },
    ];
    const hasCurrentQuotaError = recordedErrors.some(({ message, timestamp }) =>
        Boolean(
            message
            && timestamp
            && getYouTubeQuotaDay(timestamp) === getYouTubeQuotaDay()
            && isYouTubeQuotaExceededError(403, null, message)
        )
    );
    if (!quota.pausedUntil && hasCurrentQuotaError) {
        pauseYouTubeQuota();
        quota = getYouTubeQuotaStatus();
    }
    const settings = getSettings();
    const intervalNextAt = latestRun?.completedAt
        ? latestRun.completedAt + settings.syncIntervalMinutes * 60 * 1000
        : null;
    const nextScheduledAt = settings.automaticSyncEnabled
        ? Math.max(intervalNextAt ?? Date.now(), quota.pausedUntil ? new Date(quota.pausedUntil).getTime() : 0)
        : null;
    return {
        configured: isYouTubeOAuthConfigured(),
        connected: Boolean(integration?.encryptedRefreshToken),
        account: integration?.youtubeChannelId && integration.youtubeChannelTitle
            ? { channelId: integration.youtubeChannelId, title: integration.youtubeChannelTitle }
            : null,
        playlist,
        sync: {
            status: integration?.lastSyncStatus ?? "idle",
            lastStartedAt: toIso(integration?.lastSyncStartedAt ?? null),
            lastCompletedAt: toIso(integration?.lastSyncCompletedAt ?? null),
            nextSyncAt: toIso(nextScheduledAt ?? integration?.nextSyncAt ?? null),
            added: integration?.lastSyncAdded ?? 0,
            removed: integration?.lastSyncRemoved ?? 0,
            error: integration?.lastSyncError ?? null,
            lastSuccessfulAt: toIso(getLastSuccessfulSyncAt()),
        },
        catalog: {
            initialized: isApplicationInitialized(),
            lastDiscoveryAt: toIso(getLastCatalogDiscoveryAt() == null
                ? null
                : (getLastCatalogDiscoveryAt() as number) * 1000),
        },
        quota,
        progress: latestRun ? {
            ...latestRun,
            startedAt: new Date(latestRun.startedAt).toISOString(),
            completedAt: toIso(latestRun.completedAt),
        } : null,
    };
}

export async function connectYouTubeAccount(refreshToken: string): Promise<void> {
    const accessToken = await getAccessTokenFromRefreshToken(refreshToken);
    const account = await youtubeGateway.getMyAccount(accessToken);
    const previous = getYouTubeIntegration();
    const sameAccount = previous?.youtubeChannelId === account.channelId;

    if (previous?.youtubeChannelId && !sameAccount) {
        clearYouTubePlaylist();
        resetYouTubePlaylistEntries();
    }

    saveYouTubeConnection(account.channelId, account.title, encryptRefreshToken(refreshToken));
    if (!isApplicationInitialized()) return;
    const current = getYouTubeIntegration();

    const resolution = await resolveFreshMusicPlaylist(
        youtubeGateway,
        accessToken,
        FRESH_MUSIC_PLAYLIST_TITLE,
        current?.playlistId
    );
    saveYouTubePlaylist(resolution.playlist.id, resolution.playlist.title);
    if (resolution.source !== "preferred") resetYouTubePlaylistEntries();

    requestYouTubeSync("oauth", false);
}

export async function recreateYouTubePlaylist(): Promise<void> {
    const integration = getYouTubeIntegration();
    if (!integration?.encryptedRefreshToken) throw new Error("No YouTube account is connected");

    const accessToken = await getYouTubeAccessToken();
    const resolution = await resolveFreshMusicPlaylist(
        youtubeGateway,
        accessToken,
        FRESH_MUSIC_PLAYLIST_TITLE,
        integration.playlistId
    );
    saveYouTubePlaylist(resolution.playlist.id, resolution.playlist.title);
    if (resolution.source !== "preferred") resetYouTubePlaylistEntries();
    requestYouTubeSync("manual", true);
}

export async function recoverExistingYouTubePlaylist(): Promise<boolean> {
    const integration = getYouTubeIntegration();
    if (!integration?.encryptedRefreshToken) return false;

    const accessToken = await getYouTubeAccessToken();
    const resolution = await findExistingFreshMusicPlaylist(
        youtubeGateway,
        accessToken,
        FRESH_MUSIC_PLAYLIST_TITLE,
        integration.playlistId
    );
    if (!resolution) return false;

    saveYouTubePlaylist(resolution.playlist.id, resolution.playlist.title);
    if (resolution.source !== "preferred") resetYouTubePlaylistEntries();
    requestYouTubeSync("scheduled", false);
    return true;
}

export async function disconnectYouTubeAccount(): Promise<void> {
    await revokeYouTubeAuthorization();
    disconnectYouTube();
}
