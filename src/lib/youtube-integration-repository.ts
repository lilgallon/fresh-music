import { getDb } from "./db";
import { YouTubeSyncStatus } from "@/types/youtube-integration";

export interface YouTubeIntegrationRecord {
    youtubeChannelId: string | null;
    youtubeChannelTitle: string | null;
    encryptedRefreshToken: string | null;
    playlistId: string | null;
    playlistTitle: string | null;
    connectedAt: number | null;
    lastSyncStartedAt: number | null;
    lastSyncCompletedAt: number | null;
    nextSyncAt: number | null;
    lastSyncStatus: YouTubeSyncStatus;
    lastSyncError: string | null;
    lastSyncAdded: number;
    lastSyncRemoved: number;
}

interface YouTubeIntegrationRow {
    youtube_channel_id: string | null;
    youtube_channel_title: string | null;
    encrypted_refresh_token: string | null;
    playlist_id: string | null;
    playlist_title: string | null;
    connected_at: number | null;
    last_sync_started_at: number | null;
    last_sync_completed_at: number | null;
    next_sync_at: number | null;
    last_sync_status: YouTubeSyncStatus;
    last_sync_error: string | null;
    last_sync_added: number;
    last_sync_removed: number;
}

function mapIntegration(row: YouTubeIntegrationRow): YouTubeIntegrationRecord {
    return {
        youtubeChannelId: row.youtube_channel_id,
        youtubeChannelTitle: row.youtube_channel_title,
        encryptedRefreshToken: row.encrypted_refresh_token,
        playlistId: row.playlist_id,
        playlistTitle: row.playlist_title,
        connectedAt: row.connected_at,
        lastSyncStartedAt: row.last_sync_started_at,
        lastSyncCompletedAt: row.last_sync_completed_at,
        nextSyncAt: row.next_sync_at,
        lastSyncStatus: row.last_sync_status,
        lastSyncError: row.last_sync_error,
        lastSyncAdded: row.last_sync_added,
        lastSyncRemoved: row.last_sync_removed,
    };
}

export function getYouTubeIntegration(): YouTubeIntegrationRecord | null {
    const row = getDb()
        .prepare<[], YouTubeIntegrationRow>(
            `SELECT youtube_channel_id, youtube_channel_title, encrypted_refresh_token,
                    playlist_id, playlist_title, connected_at, last_sync_started_at,
                    last_sync_completed_at, next_sync_at, last_sync_status,
                    last_sync_error, last_sync_added, last_sync_removed
             FROM youtube_integration WHERE id = 1`
        )
        .get();
    return row ? mapIntegration(row) : null;
}

export function saveYouTubeConnection(
    channelId: string,
    channelTitle: string,
    encryptedRefreshToken: string
): void {
    getDb()
        .prepare(
            `INSERT INTO youtube_integration (
                id, youtube_channel_id, youtube_channel_title, encrypted_refresh_token,
                connected_at, updated_at, last_sync_status, last_sync_error
             ) VALUES (1, ?, ?, ?, unixepoch(), unixepoch(), 'idle', NULL)
             ON CONFLICT(id) DO UPDATE SET
                youtube_channel_id = excluded.youtube_channel_id,
                youtube_channel_title = excluded.youtube_channel_title,
                encrypted_refresh_token = excluded.encrypted_refresh_token,
                connected_at = excluded.connected_at,
                updated_at = excluded.updated_at,
                last_sync_status = 'idle',
                last_sync_error = NULL`
        )
        .run(channelId, channelTitle, encryptedRefreshToken);
}

export function saveYouTubePlaylist(playlistId: string, playlistTitle: string): void {
    getDb()
        .prepare(
            `INSERT INTO youtube_integration (id, playlist_id, playlist_title, updated_at)
             VALUES (1, ?, ?, unixepoch())
             ON CONFLICT(id) DO UPDATE SET
                playlist_id = excluded.playlist_id,
                playlist_title = excluded.playlist_title,
                updated_at = excluded.updated_at,
                last_sync_status = 'idle',
                last_sync_error = NULL`
        )
        .run(playlistId, playlistTitle);
}

export function clearYouTubePlaylist(): void {
    getDb()
        .prepare(
            `UPDATE youtube_integration
             SET playlist_id = NULL, playlist_title = NULL, updated_at = unixepoch()
             WHERE id = 1`
        )
        .run();
}

export function disconnectYouTube(): void {
    getDb()
        .prepare(
            `UPDATE youtube_integration
             SET encrypted_refresh_token = NULL,
                 updated_at = unixepoch(),
                 next_sync_at = NULL,
                 last_sync_status = 'disconnected',
                 last_sync_error = NULL
             WHERE id = 1`
        )
        .run();
}

export function startYouTubeSync(startedAt: number): void {
    getDb()
        .prepare(
            `UPDATE youtube_integration
             SET last_sync_started_at = ?, last_sync_status = 'running',
                 last_sync_error = NULL, updated_at = unixepoch()
             WHERE id = 1`
        )
        .run(startedAt);
}

export function finishYouTubeSync(params: {
    completedAt: number;
    nextSyncAt: number | null;
    status: YouTubeSyncStatus;
    added: number;
    removed: number;
    error: string | null;
}): void {
    getDb()
        .prepare(
            `UPDATE youtube_integration
             SET last_sync_completed_at = @completedAt,
                 next_sync_at = @nextSyncAt,
                 last_sync_status = @status,
                 last_sync_added = @added,
                 last_sync_removed = @removed,
                 last_sync_error = @error,
                 updated_at = unixepoch()
             WHERE id = 1`
        )
        .run(params);
}

export function setYouTubeIntegrationStatus(
    status: YouTubeSyncStatus,
    error: string | null = null
): void {
    getDb()
        .prepare(
            `UPDATE youtube_integration
             SET last_sync_status = ?, last_sync_error = ?,
                 next_sync_at = NULL, updated_at = unixepoch()
             WHERE id = 1`
        )
        .run(status, error);
}

export type PlaylistEntryState = "adding" | "active" | "removal_pending" | "removed";

export interface YouTubePlaylistEntry {
    videoId: string;
    sourceChannelId: string | null;
    publishedAt: string | null;
    playlistItemId: string | null;
    state: PlaylistEntryState;
    managedByApp: boolean;
    removalReason: string | null;
    lastError: string | null;
}

interface PlaylistEntryRow {
    video_id: string;
    source_channel_id: string | null;
    published_at: string | null;
    playlist_item_id: string | null;
    state: PlaylistEntryState;
    managed_by_app: number;
    removal_reason: string | null;
    last_error: string | null;
}

function mapEntry(row: PlaylistEntryRow): YouTubePlaylistEntry {
    return {
        videoId: row.video_id,
        sourceChannelId: row.source_channel_id,
        publishedAt: row.published_at,
        playlistItemId: row.playlist_item_id,
        state: row.state,
        managedByApp: row.managed_by_app === 1,
        removalReason: row.removal_reason,
        lastError: row.last_error,
    };
}

export function listYouTubePlaylistEntries(): YouTubePlaylistEntry[] {
    return getDb()
        .prepare<[], PlaylistEntryRow>(
            `SELECT video_id, source_channel_id, published_at, playlist_item_id,
                    state, managed_by_app, removal_reason, last_error
             FROM youtube_playlist_entries`
        )
        .all()
        .map(mapEntry);
}

export function getYouTubePlaylistEntry(videoId: string): YouTubePlaylistEntry | null {
    const row = getDb()
        .prepare<[string], PlaylistEntryRow>(
            `SELECT video_id, source_channel_id, published_at, playlist_item_id,
                    state, managed_by_app, removal_reason, last_error
             FROM youtube_playlist_entries WHERE video_id = ?`
        )
        .get(videoId);
    return row ? mapEntry(row) : null;
}

export function prepareYouTubePlaylistEntry(params: {
    videoId: string;
    sourceChannelId?: string | null;
    publishedAt?: string | null;
    managedByApp?: boolean;
}): void {
    getDb()
        .prepare(
            `INSERT INTO youtube_playlist_entries (
                video_id, source_channel_id, published_at, state, managed_by_app, updated_at
             ) VALUES (@videoId, @sourceChannelId, @publishedAt, 'adding', @managedByApp, unixepoch())
             ON CONFLICT(video_id) DO UPDATE SET
                source_channel_id = COALESCE(excluded.source_channel_id, source_channel_id),
                published_at = COALESCE(excluded.published_at, published_at),
                playlist_item_id = NULL,
                state = 'adding',
                managed_by_app = excluded.managed_by_app,
                removal_reason = NULL,
                removed_at = NULL,
                last_error = NULL,
                updated_at = unixepoch()`
        )
        .run({
            videoId: params.videoId,
            sourceChannelId: params.sourceChannelId ?? null,
            publishedAt: params.publishedAt ?? null,
            managedByApp: params.managedByApp === false ? 0 : 1,
        });
}

export function activateYouTubePlaylistEntry(params: {
    videoId: string;
    playlistItemId: string;
    managedByApp: boolean;
    sourceChannelId?: string | null;
    publishedAt?: string | null;
}): void {
    getDb()
        .prepare(
            `INSERT INTO youtube_playlist_entries (
                video_id, source_channel_id, published_at, playlist_item_id,
                state, managed_by_app, added_at, updated_at
             ) VALUES (@videoId, @sourceChannelId, @publishedAt, @playlistItemId,
                       'active', @managedByApp, unixepoch(), unixepoch())
             ON CONFLICT(video_id) DO UPDATE SET
                source_channel_id = COALESCE(excluded.source_channel_id, source_channel_id),
                published_at = COALESCE(excluded.published_at, published_at),
                playlist_item_id = excluded.playlist_item_id,
                state = 'active',
                managed_by_app = excluded.managed_by_app,
                removal_reason = NULL,
                removed_at = NULL,
                last_error = NULL,
                added_at = COALESCE(added_at, unixepoch()),
                updated_at = unixepoch()`
        )
        .run({
            ...params,
            sourceChannelId: params.sourceChannelId ?? null,
            publishedAt: params.publishedAt ?? null,
            managedByApp: params.managedByApp ? 1 : 0,
        });
}

export function requestYouTubePlaylistRemoval(videoId: string): void {
    getDb()
        .prepare(
            `UPDATE youtube_playlist_entries
             SET state = 'removal_pending', last_error = NULL, updated_at = unixepoch()
             WHERE video_id = ? AND managed_by_app = 1 AND state IN ('adding', 'active')`
        )
        .run(videoId);
}

export function markYouTubePlaylistEntryRemoved(
    videoId: string,
    reason: "watched" | "external" | "playlist_recreated" | "filtered"
): void {
    getDb()
        .prepare(
            `UPDATE youtube_playlist_entries
             SET playlist_item_id = NULL, state = 'removed', removal_reason = ?,
                 removed_at = unixepoch(), last_error = NULL, updated_at = unixepoch()
             WHERE video_id = ?`
        )
        .run(reason, videoId);
}

export function setYouTubePlaylistEntryError(videoId: string, error: string): void {
    getDb()
        .prepare(
            `UPDATE youtube_playlist_entries
             SET last_error = ?, updated_at = unixepoch() WHERE video_id = ?`
        )
        .run(error, videoId);
}

export function resetYouTubePlaylistEntries(): void {
    getDb().prepare("DELETE FROM youtube_playlist_entries").run();
}
