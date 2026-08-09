import "server-only";

import { getDb } from "./db";
import type { AppSettings } from "@/types/settings";
import type { YouTubeVideo } from "@/types/youtube";

export interface CatalogVideoInput {
    id: string;
    channelId: string | null;
    title: string;
    channelTitle: string;
    thumbnail: string;
    publishedAt: string | null;
    durationSeconds: number | null;
    liveStatus: "live" | "upcoming" | "none" | null;
    isShort: boolean | null;
    unavailable?: boolean;
}

interface CatalogRow {
    video_id: string;
    channel_id: string | null;
    title: string;
    channel_title: string;
    thumbnail_url: string;
    published_at: string | null;
    duration_seconds: number | null;
    live_status: "live" | "upcoming" | "none" | null;
    is_short: number | null;
    availability_status: "available" | "unavailable";
    watched_at: number | null;
}

function rowToVideo(row: CatalogRow): YouTubeVideo {
    return {
        id: row.video_id,
        title: row.title || (row.availability_status === "unavailable" ? "Unavailable video" : "Untitled video"),
        thumbnail: row.thumbnail_url,
        channelTitle: row.channel_title,
        channelId: row.channel_id ?? undefined,
        publishedAt: row.published_at ?? new Date((row.watched_at ?? 0) * 1000).toISOString(),
        durationSeconds: row.duration_seconds,
        liveStatus: row.live_status,
        isShort: row.is_short == null ? null : row.is_short === 1,
        watchedAt: row.watched_at == null ? null : new Date(row.watched_at * 1000).toISOString(),
        unavailable: row.availability_status === "unavailable",
    };
}

export function upsertCatalogVideos(videos: CatalogVideoInput[]): number {
    if (videos.length === 0) return 0;
    const statement = getDb().prepare(
        `INSERT INTO videos (
            video_id, channel_id, title, channel_title, thumbnail_url, published_at,
            duration_seconds, live_status, is_short, availability_status,
            discovered_at, metadata_checked_at, updated_at
         ) VALUES (
            @id, @channelId, @title, @channelTitle, @thumbnail, @publishedAt,
            @durationSeconds, @liveStatus, @isShort, @availabilityStatus,
            unixepoch(), unixepoch(), unixepoch()
         )
         ON CONFLICT(video_id) DO UPDATE SET
            channel_id = COALESCE(excluded.channel_id, videos.channel_id),
            title = CASE WHEN excluded.title = '' THEN videos.title ELSE excluded.title END,
            channel_title = CASE WHEN excluded.channel_title = '' THEN videos.channel_title ELSE excluded.channel_title END,
            thumbnail_url = CASE WHEN excluded.thumbnail_url = '' THEN videos.thumbnail_url ELSE excluded.thumbnail_url END,
            published_at = COALESCE(excluded.published_at, videos.published_at),
            duration_seconds = COALESCE(excluded.duration_seconds, videos.duration_seconds),
            live_status = COALESCE(excluded.live_status, videos.live_status),
            is_short = COALESCE(excluded.is_short, videos.is_short),
            availability_status = excluded.availability_status,
            metadata_checked_at = unixepoch(),
            updated_at = unixepoch()`
    );
    getDb().transaction(() => {
        for (const video of videos) {
            statement.run({
                ...video,
                isShort: video.isShort == null ? null : video.isShort ? 1 : 0,
                availabilityStatus: video.unavailable ? "unavailable" : "available",
            });
        }
    })();
    return videos.length;
}

export function ensureUnavailableCatalogVideos(videoIds: string[]): void {
    if (videoIds.length === 0) return;
    const statement = getDb().prepare(
        `INSERT INTO videos (
            video_id, title, channel_title, thumbnail_url, availability_status,
            discovered_at, metadata_checked_at, updated_at
         ) VALUES (?, 'Unavailable video', '', '', 'unavailable', unixepoch(), unixepoch(), unixepoch())
         ON CONFLICT(video_id) DO UPDATE SET
            availability_status = 'unavailable',
            metadata_checked_at = unixepoch(),
            updated_at = unixepoch()`
    );
    getDb().transaction(() => {
        for (const id of videoIds) statement.run(id);
    })();
}

export function listWatchedIdsMissingCatalog(limit = 50): string[] {
    return getDb().prepare<[number], { video_id: string }>(
        `SELECT watched_videos.video_id
         FROM watched_videos
         LEFT JOIN videos ON videos.video_id = watched_videos.video_id
         WHERE videos.video_id IS NULL OR videos.metadata_checked_at IS NULL
         ORDER BY watched_videos.watched_at ASC
         LIMIT ?`
    ).all(limit).map((row) => row.video_id);
}

export function listCatalogIdsNeedingMetadataRefresh(settings: AppSettings): string[] {
    const cutoffIso = new Date(
        Date.now() - settings.videoLookbackDays * 24 * 60 * 60 * 1000
    ).toISOString();
    const staleBefore = Math.floor(Date.now() / 1000) - settings.shortCacheTtlDays * 24 * 60 * 60;
    return getDb().prepare<[string, number], { video_id: string }>(
        `SELECT videos.video_id
         FROM videos
         JOIN channels ON channels.channel_id = videos.channel_id
         LEFT JOIN watched_videos ON watched_videos.video_id = videos.video_id
         WHERE watched_videos.video_id IS NULL
           AND videos.published_at >= ?
           AND (videos.metadata_checked_at IS NULL OR videos.metadata_checked_at < ?)
         ORDER BY videos.metadata_checked_at ASC, videos.published_at DESC`
    ).all(cutoffIso, staleBefore).map((row) => row.video_id);
}

export function isCatalogEligible(video: YouTubeVideo, settings: AppSettings): boolean {
    if (video.unavailable || video.isShort) return false;
    if (video.liveStatus === "live" || video.liveStatus === "upcoming") return false;
    if (video.durationSeconds != null && settings.minimumDurationSeconds != null
        && video.durationSeconds < settings.minimumDurationSeconds) return false;
    if (video.durationSeconds != null && settings.maximumDurationSeconds != null
        && video.durationSeconds > settings.maximumDurationSeconds) return false;
    const title = video.title.toLocaleLowerCase();
    if (settings.excludedTitleTerms.some((term) => title.includes(term.toLocaleLowerCase()))) return false;
    return true;
}

function listRows(): CatalogRow[] {
    return getDb().prepare<[], CatalogRow>(
        `SELECT videos.video_id, videos.channel_id, videos.title, videos.channel_title,
                videos.thumbnail_url, videos.published_at, videos.duration_seconds,
                videos.live_status, videos.is_short, videos.availability_status,
                watched_videos.watched_at
         FROM videos
         LEFT JOIN watched_videos ON watched_videos.video_id = videos.video_id`
    ).all();
}

export function listEligibleUnwatchedCatalogVideos(settings: AppSettings): YouTubeVideo[] {
    const cutoff = Date.now() - settings.videoLookbackDays * 24 * 60 * 60 * 1000;
    return listRows()
        .filter((row) => row.watched_at == null)
        .map(rowToVideo)
        .filter((video) => new Date(video.publishedAt).getTime() >= cutoff)
        .filter((video) => isCatalogEligible(video, settings))
        .sort((left, right) => left.publishedAt.localeCompare(right.publishedAt));
}

export function listIneligibleCatalogVideoIds(videoIds: string[], settings: AppSettings): Set<string> {
    if (videoIds.length === 0) return new Set();
    const requested = new Set(videoIds);
    const cutoff = Date.now() - settings.videoLookbackDays * 24 * 60 * 60 * 1000;
    return new Set(
        listRows()
            .map(rowToVideo)
            .filter((video) => requested.has(video.id) && (
                new Date(video.publishedAt).getTime() < cutoff
                || !isCatalogEligible(video, settings)
            ))
            .map((video) => video.id)
    );
}

export function listCatalogVideos(
    tab: "new" | "history",
    settings: AppSettings,
    limit: number,
    offset: number
): { videos: YouTubeVideo[]; nextCursor: string | null } {
    const cutoff = Date.now() - settings.videoLookbackDays * 24 * 60 * 60 * 1000;
    const all = listRows()
        .map(rowToVideo)
        .filter((video) => tab === "history"
            ? video.watchedAt != null
            : video.watchedAt == null
                && new Date(video.publishedAt).getTime() >= cutoff
                && isCatalogEligible(video, settings))
        .sort((left, right) => {
            if (tab === "history") {
                const watchedOrder = (right.watchedAt ?? "").localeCompare(left.watchedAt ?? "");
                if (watchedOrder !== 0) return watchedOrder;
            }
            return right.publishedAt.localeCompare(left.publishedAt);
        });
    const page = all.slice(offset, offset + limit);
    return {
        videos: page,
        nextCursor: offset + limit < all.length ? String(offset + limit) : null,
    };
}

export function setApplicationInitialized(): void {
    getDb().prepare(
        `INSERT INTO app_settings (key, value, updated_at) VALUES ('initialization_completed', 'true', unixepoch())
         ON CONFLICT(key) DO UPDATE SET value = 'true', updated_at = unixepoch()`
    ).run();
}

export function isApplicationInitialized(): boolean {
    return getDb().prepare<[], { value: string }>(
        "SELECT value FROM app_settings WHERE key = 'initialization_completed'"
    ).get()?.value === "true";
}

export function isLegacyHistoryEnriched(): boolean {
    return getDb().prepare<[], { value: string }>(
        "SELECT value FROM app_settings WHERE key = 'legacy_history_enriched'"
    ).get()?.value === "true";
}

export function markLegacyHistoryEnriched(): void {
    getDb().prepare(
        `INSERT INTO app_settings (key, value, updated_at) VALUES ('legacy_history_enriched', 'true', unixepoch())
         ON CONFLICT(key) DO UPDATE SET value = 'true', updated_at = unixepoch()`
    ).run();
}

export function updateChannelDiscoveryState(
    channelId: string,
    uploadsPlaylistId: string,
    newestVideoId: string | null
): void {
    getDb().prepare(
        `UPDATE channels
         SET uploads_playlist_id = ?,
             last_discovered_video_id = COALESCE(?, last_discovered_video_id),
             last_discovery_at = unixepoch()
         WHERE channel_id = ?`
    ).run(uploadsPlaylistId, newestVideoId, channelId);
}

export interface ChannelDiscoveryState {
    channelId: string;
    name: string;
    uploadsPlaylistId: string | null;
    lastDiscoveredVideoId: string | null;
}

export function listChannelDiscoveryStates(): ChannelDiscoveryState[] {
    return getDb().prepare<[], {
        channel_id: string;
        name: string;
        uploads_playlist_id: string | null;
        last_discovered_video_id: string | null;
    }>(
        `SELECT channel_id, name, uploads_playlist_id, last_discovered_video_id
         FROM channels ORDER BY added_at ASC`
    ).all().map((row) => ({
        channelId: row.channel_id,
        name: row.name,
        uploadsPlaylistId: row.uploads_playlist_id,
        lastDiscoveredVideoId: row.last_discovered_video_id,
    }));
}

export function getLastCatalogDiscoveryAt(): number | null {
    return getDb().prepare<[], { value: number | null }>(
        "SELECT MAX(last_discovery_at) AS value FROM channels"
    ).get()?.value ?? null;
}
