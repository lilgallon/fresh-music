import { getDb } from "./db";
import { YouTubeChannel } from "@/types/youtube";

export interface AppSettings {
    videoLookbackDays: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
    videoLookbackDays: 30,
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

export function getSettings(): AppSettings {
    const row = getDb()
        .prepare<[string], { value: string }>("SELECT value FROM app_settings WHERE key = ?")
        .get("video_lookback_days");

    return {
        videoLookbackDays: normalizeVideoLookbackDays(
            row?.value ?? DEFAULT_SETTINGS.videoLookbackDays
        ),
    };
}

export function saveSettings(settings: Partial<AppSettings>): AppSettings {
    const next = {
        ...getSettings(),
        ...settings,
    };
    next.videoLookbackDays = normalizeVideoLookbackDays(next.videoLookbackDays);

    getDb()
        .prepare(
            `INSERT INTO app_settings (key, value, updated_at)
             VALUES (?, ?, unixepoch())
             ON CONFLICT(key) DO UPDATE SET
               value = excluded.value,
               updated_at = excluded.updated_at`
        )
        .run("video_lookback_days", String(next.videoLookbackDays));

    return next;
}
