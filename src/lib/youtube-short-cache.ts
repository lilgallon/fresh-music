import "server-only";

import { getDb } from "./db";
import { detectYouTubeShort } from "./youtube-content-filter";
import { getSettings } from "./repository";

interface ShortCacheRow {
    is_short: number;
}

export async function isYouTubeShortCached(videoId: string): Promise<boolean> {
    const cacheTtlSeconds = getSettings().shortCacheTtlDays * 24 * 60 * 60;
    const cached = getDb()
        .prepare<[string, number], ShortCacheRow>(
            `SELECT is_short
             FROM youtube_short_cache
             WHERE video_id = ? AND checked_at >= unixepoch() - ?`
        )
        .get(videoId, cacheTtlSeconds);
    if (cached) return cached.is_short === 1;

    const detected = await detectYouTubeShort(videoId);
    if (detected == null) return false;

    getDb()
        .prepare(
            `INSERT INTO youtube_short_cache (video_id, is_short, checked_at)
             VALUES (?, ?, unixepoch())
             ON CONFLICT(video_id) DO UPDATE SET
               is_short = excluded.is_short,
               checked_at = excluded.checked_at`
        )
        .run(videoId, detected ? 1 : 0);
    return detected;
}
