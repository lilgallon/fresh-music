import "server-only";

import { getDb } from "./db";
import type { YouTubeRating } from "@/types/youtube-rating";

export interface KnownYouTubeRating {
    videoId: string;
    rating: YouTubeRating;
}

export function saveYouTubeRatings(
    youtubeAccountId: string,
    ratings: KnownYouTubeRating[],
    checkedAt = Date.now()
): void {
    if (ratings.length === 0) return;
    const statement = getDb().prepare(
        `INSERT INTO youtube_video_ratings (
            youtube_account_id, video_id, rating, checked_at
         ) VALUES (?, ?, ?, ?)
         ON CONFLICT(youtube_account_id, video_id) DO UPDATE SET
            rating = excluded.rating,
            checked_at = excluded.checked_at`
    );
    getDb().transaction(() => {
        for (const rating of ratings) {
            statement.run(youtubeAccountId, rating.videoId, rating.rating, checkedAt);
        }
    })();
}

export function saveYouTubeRating(
    youtubeAccountId: string,
    videoId: string,
    rating: YouTubeRating,
    checkedAt = Date.now()
): void {
    saveYouTubeRatings(youtubeAccountId, [{ videoId, rating }], checkedAt);
}

export function listWatchedVideoIds(): string[] {
    return getDb().prepare<[], { video_id: string }>(
        "SELECT video_id FROM watched_videos ORDER BY watched_at ASC"
    ).all().map((row) => row.video_id);
}

export function listUncheckedWatchedVideoIds(youtubeAccountId: string): string[] {
    return getDb().prepare<[string], { video_id: string }>(
        `SELECT watched_videos.video_id
         FROM watched_videos
         LEFT JOIN youtube_video_ratings
           ON youtube_video_ratings.youtube_account_id = ?
          AND youtube_video_ratings.video_id = watched_videos.video_id
         WHERE youtube_video_ratings.video_id IS NULL
            OR youtube_video_ratings.checked_at < watched_videos.watched_at * 1000
         ORDER BY watched_videos.watched_at ASC`
    ).all(youtubeAccountId).map((row) => row.video_id);
}

export function getLastFullYouTubeRatingSyncAt(youtubeAccountId: string): number | null {
    return getDb().prepare<[string], { last_full_sync_at: number | null }>(
        `SELECT last_full_sync_at
         FROM youtube_rating_sync_state
         WHERE youtube_account_id = ?`
    ).get(youtubeAccountId)?.last_full_sync_at ?? null;
}

export function setLastFullYouTubeRatingSyncAt(
    youtubeAccountId: string,
    timestamp: number
): void {
    getDb().prepare(
        `INSERT INTO youtube_rating_sync_state (youtube_account_id, last_full_sync_at)
         VALUES (?, ?)
         ON CONFLICT(youtube_account_id) DO UPDATE SET
            last_full_sync_at = excluded.last_full_sync_at`
    ).run(youtubeAccountId, timestamp);
}
