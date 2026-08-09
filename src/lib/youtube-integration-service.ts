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
import { synchronizeYouTubePlaylist } from "./playlist-sync";
import { resolveFreshMusicPlaylist } from "./youtube-playlist-resolution";
import { YouTubeIntegrationPublicStatus } from "@/types/youtube-integration";

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
            nextSyncAt: toIso(integration?.nextSyncAt ?? null),
            added: integration?.lastSyncAdded ?? 0,
            removed: integration?.lastSyncRemoved ?? 0,
            error: integration?.lastSyncError ?? null,
        },
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
    const current = getYouTubeIntegration();

    const resolution = await resolveFreshMusicPlaylist(
        youtubeGateway,
        accessToken,
        FRESH_MUSIC_PLAYLIST_TITLE,
        current?.playlistId
    );
    saveYouTubePlaylist(resolution.playlist.id, resolution.playlist.title);
    if (resolution.source !== "preferred") resetYouTubePlaylistEntries();

    try {
        await synchronizeYouTubePlaylist();
    } catch (error) {
        console.error("YouTube account connected, but the initial playlist sync failed:", error);
    }
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
    await synchronizeYouTubePlaylist();
}

export async function disconnectYouTubeAccount(): Promise<void> {
    await revokeYouTubeAuthorization();
    disconnectYouTube();
}
