import { getDb } from "./db";
import { YouTubeChannel } from "@/types/youtube";

export interface AppSettings {
    videoLookbackDays: number;
    excludedTitleTerms: string[];
    minimumDurationSeconds: number | null;
    maximumDurationSeconds: number | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
    videoLookbackDays: 30,
    excludedTitleTerms: [],
    minimumDurationSeconds: null,
    maximumDurationSeconds: null,
};

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
    });
    tx(videoIds);
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
    })();

    return next;
}
