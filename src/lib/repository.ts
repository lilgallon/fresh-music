import { getDb } from "./db";
import { YouTubeChannel } from "@/types/youtube";
import { AppSettings, DEFAULT_SETTINGS } from "@/types/settings";

export type { AppSettings } from "@/types/settings";
export { DEFAULT_SETTINGS } from "@/types/settings";

interface ChannelRow {
    channel_id: string;
    name: string;
    is_music_only: number;
    thumbnail: string | null;
    description: string | null;
}

function rowToChannel(row: ChannelRow): YouTubeChannel {
    return {
        channelId: row.channel_id,
        name: row.name,
        isMusicOnly: row.is_music_only === 1,
        thumbnail: row.thumbnail ?? undefined,
        description: row.description ?? undefined,
    };
}

export function listChannels(): YouTubeChannel[] {
    const rows = getDb()
        .prepare<[], ChannelRow>(
            "SELECT channel_id, name, is_music_only, thumbnail, description FROM channels ORDER BY added_at ASC"
        )
        .all();
    return rows.map(rowToChannel);
}

export function upsertChannel(channel: YouTubeChannel): void {
    getDb()
        .prepare(
            `INSERT INTO channels (channel_id, name, is_music_only, thumbnail, description)
             VALUES (@channelId, @name, @isMusicOnly, @thumbnail, @description)
             ON CONFLICT(channel_id) DO UPDATE SET
               name          = excluded.name,
               is_music_only = excluded.is_music_only,
               thumbnail     = COALESCE(excluded.thumbnail, channels.thumbnail),
               description   = COALESCE(excluded.description, channels.description)`
        )
        .run({
            channelId: channel.channelId,
            name: channel.name,
            isMusicOnly: channel.isMusicOnly ? 1 : 0,
            thumbnail: channel.thumbnail ?? null,
            description: channel.description ?? null,
        });
}

export function deleteChannel(channelId: string): void {
    getDb().prepare("DELETE FROM channels WHERE channel_id = ?").run(channelId);
}

export function replaceChannels(channels: YouTubeChannel[]): void {
    const db = getDb();
    const tx = db.transaction((list: YouTubeChannel[]) => {
        db.prepare("DELETE FROM channels").run();
        const insert = db.prepare(
            `INSERT INTO channels (channel_id, name, is_music_only, thumbnail, description)
             VALUES (@channelId, @name, @isMusicOnly, @thumbnail, @description)`
        );
        for (const c of list) {
            insert.run({
                channelId: c.channelId,
                name: c.name,
                isMusicOnly: c.isMusicOnly ? 1 : 0,
                thumbnail: c.thumbnail ?? null,
                description: c.description ?? null,
            });
        }
    });
    tx(channels);
}

export function listWatched(): string[] {
    const rows = getDb()
        .prepare<[], { video_id: string }>(
            "SELECT video_id FROM watched_videos ORDER BY watched_at ASC"
        )
        .all();
    return rows.map((r) => r.video_id);
}

export function markWatched(videoId: string): void {
    getDb()
        .prepare("INSERT OR IGNORE INTO watched_videos (video_id) VALUES (?)")
        .run(videoId);
}

export function unmarkWatched(videoId: string): void {
    getDb().prepare("DELETE FROM watched_videos WHERE video_id = ?").run(videoId);
}

export function replaceWatched(videoIds: string[]): void {
    const db = getDb();
    const tx = db.transaction((list: string[]) => {
        db.prepare("DELETE FROM watched_videos").run();
        const insert = db.prepare("INSERT OR IGNORE INTO watched_videos (video_id) VALUES (?)");
        for (const id of list) insert.run(id);
        db.prepare(
            `INSERT OR IGNORE INTO videos (
                video_id, title, channel_title, thumbnail_url, availability_status,
                discovered_at, metadata_checked_at, updated_at
             )
             SELECT video_id, 'Video pending metadata', '', '', 'unavailable',
                    unixepoch(), NULL, unixepoch()
             FROM watched_videos`
        ).run();
    });
    tx(videoIds);
}

export function bootstrapApplication(params: {
    cachedChannels: YouTubeChannel[] | null;
    cachedWatched: string[] | null;
    cachedSettings: Partial<AppSettings> | null;
    defaultChannels: YouTubeChannel[];
}): { channels: YouTubeChannel[]; watchedIds: string[]; settings: AppSettings } {
    const db = getDb();
    db.transaction(() => {
        const channelCount = db.prepare<[], { count: number }>(
            "SELECT COUNT(*) AS count FROM channels"
        ).get()?.count ?? 0;
        if (channelCount === 0) {
            replaceChannels(
                params.cachedChannels && params.cachedChannels.length > 0
                    ? params.cachedChannels
                    : params.defaultChannels
            );
        }

        const watchedCount = db.prepare<[], { count: number }>(
            "SELECT COUNT(*) AS count FROM watched_videos"
        ).get()?.count ?? 0;
        if (watchedCount === 0 && params.cachedWatched && params.cachedWatched.length > 0) {
            replaceWatched(params.cachedWatched);
        }

        db.prepare(
            `INSERT OR IGNORE INTO videos (
                video_id, title, channel_title, thumbnail_url, availability_status,
                discovered_at, metadata_checked_at, updated_at
             )
             SELECT video_id, 'Video pending metadata', '', '', 'unavailable',
                    unixepoch(), NULL, unixepoch()
             FROM watched_videos`
        ).run();

        const hasUserSettings = db.prepare<[], { count: number }>(
            "SELECT COUNT(*) AS count FROM app_settings WHERE key = 'video_lookback_days'"
        ).get()?.count ?? 0;
        if (hasUserSettings === 0 && params.cachedSettings) saveSettings(params.cachedSettings);

        db.prepare(
            `INSERT INTO app_settings (key, value, updated_at)
             VALUES ('initialization_completed', 'true', unixepoch())
             ON CONFLICT(key) DO UPDATE SET value = 'true', updated_at = unixepoch()`
        ).run();
    })();

    return { channels: listChannels(), watchedIds: listWatched(), settings: getSettings() };
}

function normalizeVideoLookbackDays(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) return DEFAULT_SETTINGS.videoLookbackDays;
    return Math.min(365, Math.max(1, Math.round(parsed)));
}

function normalizeTitleTerms(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const terms: string[] = [];
    for (const candidate of value) {
        if (typeof candidate !== "string") continue;
        const term = candidate.trim().slice(0, 100);
        const key = term.toLocaleLowerCase();
        if (!term || seen.has(key)) continue;
        seen.add(key);
        terms.push(term);
        if (terms.length === 50) break;
    }
    return terms;
}

function normalizeOptionalDuration(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.min(86_400, Math.max(0, Math.round(parsed)));
}

function normalizeInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
    return fallback;
}

export function getSettings(): AppSettings {
    const rows = getDb()
        .prepare<[], { key: string; value: string }>("SELECT key, value FROM app_settings")
        .all();
    const values = new Map(rows.map((row) => [row.key, row.value]));

    let excludedTitleTerms: unknown = [];
    try {
        excludedTitleTerms = JSON.parse(values.get("excluded_title_terms") ?? "[]");
    } catch {
        // Fall back to no title filters when a manually edited value is invalid.
    }

    return {
        videoLookbackDays: normalizeVideoLookbackDays(
            values.get("video_lookback_days") ?? DEFAULT_SETTINGS.videoLookbackDays
        ),
        excludedTitleTerms: normalizeTitleTerms(excludedTitleTerms),
        minimumDurationSeconds: normalizeOptionalDuration(values.get("minimum_duration_seconds")),
        maximumDurationSeconds: normalizeOptionalDuration(values.get("maximum_duration_seconds")),
        automaticSyncEnabled: normalizeBoolean(
            values.get("automatic_sync_enabled"), DEFAULT_SETTINGS.automaticSyncEnabled
        ),
        syncIntervalMinutes: normalizeInteger(
            values.get("sync_interval_minutes"), DEFAULT_SETTINGS.syncIntervalMinutes, 5, 1440
        ),
        youtubeDailyQuotaUnits: normalizeInteger(
            values.get("youtube_daily_quota_units"), DEFAULT_SETTINGS.youtubeDailyQuotaUnits, 50, 1_000_000
        ),
        youtubeDailyWriteBudgetUnits: normalizeInteger(
            values.get("youtube_daily_write_budget_units"),
            DEFAULT_SETTINGS.youtubeDailyWriteBudgetUnits,
            0,
            1_000_000
        ),
        maxPlaylistAddsPerSync: normalizeInteger(
            values.get("max_playlist_adds_per_sync"), DEFAULT_SETTINGS.maxPlaylistAddsPerSync, 1, 1000
        ),
        maxPlaylistRemovalsPerSync: normalizeInteger(
            values.get("max_playlist_removals_per_sync"),
            DEFAULT_SETTINGS.maxPlaylistRemovalsPerSync,
            1,
            1000
        ),
        maxDiscoveryPagesPerChannel: normalizeInteger(
            values.get("max_discovery_pages_per_channel"),
            DEFAULT_SETTINGS.maxDiscoveryPagesPerChannel,
            1,
            100
        ),
        shortCacheTtlDays: normalizeInteger(
            values.get("short_cache_ttl_days"), DEFAULT_SETTINGS.shortCacheTtlDays, 1, 365
        ),
    };
}

export function saveSettings(settings: Partial<AppSettings>): AppSettings {
    const next = {
        ...getSettings(),
        ...settings,
    };
    next.videoLookbackDays = normalizeVideoLookbackDays(next.videoLookbackDays);
    next.excludedTitleTerms = normalizeTitleTerms(next.excludedTitleTerms);
    next.minimumDurationSeconds = normalizeOptionalDuration(next.minimumDurationSeconds);
    next.maximumDurationSeconds = normalizeOptionalDuration(next.maximumDurationSeconds);
    next.automaticSyncEnabled = normalizeBoolean(
        next.automaticSyncEnabled, DEFAULT_SETTINGS.automaticSyncEnabled
    );
    next.syncIntervalMinutes = normalizeInteger(next.syncIntervalMinutes, 60, 5, 1440);
    next.youtubeDailyQuotaUnits = normalizeInteger(
        next.youtubeDailyQuotaUnits, 10_000, 50, 1_000_000
    );
    next.youtubeDailyWriteBudgetUnits = normalizeInteger(
        next.youtubeDailyWriteBudgetUnits, 5_000, 0, next.youtubeDailyQuotaUnits
    );
    next.youtubeDailyWriteBudgetUnits -= next.youtubeDailyWriteBudgetUnits % 50;
    next.maxPlaylistAddsPerSync = normalizeInteger(next.maxPlaylistAddsPerSync, 25, 1, 1000);
    next.maxPlaylistRemovalsPerSync = normalizeInteger(next.maxPlaylistRemovalsPerSync, 25, 1, 1000);
    next.maxDiscoveryPagesPerChannel = normalizeInteger(next.maxDiscoveryPagesPerChannel, 10, 1, 100);
    next.shortCacheTtlDays = normalizeInteger(next.shortCacheTtlDays, 30, 1, 365);
    if (
        next.minimumDurationSeconds != null
        && next.maximumDurationSeconds != null
        && next.maximumDurationSeconds < next.minimumDurationSeconds
    ) {
        next.maximumDurationSeconds = next.minimumDurationSeconds;
    }

    const db = getDb();
    const upsert = db.prepare(
            `INSERT INTO app_settings (key, value, updated_at)
             VALUES (?, ?, unixepoch())
             ON CONFLICT(key) DO UPDATE SET
               value = excluded.value,
               updated_at = excluded.updated_at`
        );
    db.transaction(() => {
        upsert.run("video_lookback_days", String(next.videoLookbackDays));
        upsert.run("excluded_title_terms", JSON.stringify(next.excludedTitleTerms));
        upsert.run("minimum_duration_seconds", next.minimumDurationSeconds == null
            ? ""
            : String(next.minimumDurationSeconds));
        upsert.run("maximum_duration_seconds", next.maximumDurationSeconds == null
            ? ""
            : String(next.maximumDurationSeconds));
        upsert.run("automatic_sync_enabled", String(next.automaticSyncEnabled));
        upsert.run("sync_interval_minutes", String(next.syncIntervalMinutes));
        upsert.run("youtube_daily_quota_units", String(next.youtubeDailyQuotaUnits));
        upsert.run("youtube_daily_write_budget_units", String(next.youtubeDailyWriteBudgetUnits));
        upsert.run("max_playlist_adds_per_sync", String(next.maxPlaylistAddsPerSync));
        upsert.run("max_playlist_removals_per_sync", String(next.maxPlaylistRemovalsPerSync));
        upsert.run("max_discovery_pages_per_channel", String(next.maxDiscoveryPagesPerChannel));
        upsert.run("short_cache_ttl_days", String(next.shortCacheTtlDays));
    })();

    return next;
}
