import "server-only";

import { getDb } from "./db";
import { getYouTubeIntegration } from "./youtube-integration-repository";
import {
    getLastFullYouTubeRatingSyncAt,
    listUncheckedWatchedVideoIds,
} from "./youtube-rating-repository";
import { YOUTUBE_RATING_REFRESH_INTERVAL_MS } from "./youtube-rating-sync-core";
import type {
    ChannelStatistic,
    ChannelStatisticsResponse,
} from "@/types/channel-statistics";

interface StatisticRow {
    channel_id: string;
    name: string;
    thumbnail: string | null;
    followed: number;
    watched_count: number;
    liked_count: number;
    rating_coverage_count: number;
}

export function listChannelStatistics(youtubeAccountId: string | null): ChannelStatistic[] {
    const rows = getDb().prepare<[string | null], StatisticRow>(
        `WITH known_channels AS (
            SELECT channel_id, name, thumbnail, 1 AS followed
            FROM channels
            UNION ALL
            SELECT videos.channel_id,
                   COALESCE(MAX(NULLIF(videos.channel_title, '')), videos.channel_id) AS name,
                   NULL AS thumbnail,
                   0 AS followed
            FROM videos
            WHERE videos.channel_id IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM channels WHERE channels.channel_id = videos.channel_id
              )
            GROUP BY videos.channel_id
         )
         SELECT known_channels.channel_id,
                known_channels.name,
                known_channels.thumbnail,
                known_channels.followed,
                COUNT(DISTINCT watched_videos.video_id) AS watched_count,
                COUNT(DISTINCT CASE
                    WHEN watched_videos.video_id IS NOT NULL
                     AND youtube_video_ratings.rating = 'like'
                    THEN watched_videos.video_id END) AS liked_count,
                COUNT(DISTINCT CASE
                    WHEN watched_videos.video_id IS NOT NULL
                     AND youtube_video_ratings.video_id IS NOT NULL
                    THEN watched_videos.video_id END) AS rating_coverage_count
         FROM known_channels
         LEFT JOIN videos ON videos.channel_id = known_channels.channel_id
         LEFT JOIN watched_videos ON watched_videos.video_id = videos.video_id
         LEFT JOIN youtube_video_ratings
           ON youtube_video_ratings.youtube_account_id = ?
          AND youtube_video_ratings.video_id = videos.video_id
         GROUP BY known_channels.channel_id, known_channels.name,
                  known_channels.thumbnail, known_channels.followed`
    ).all(youtubeAccountId);

    return rows.map((row) => {
        const ratingsComplete = row.rating_coverage_count === row.watched_count;
        return {
            channelId: row.channel_id,
            name: row.name,
            thumbnail: row.thumbnail,
            followed: row.followed === 1,
            watchedCount: row.watched_count,
            likedCount: row.liked_count,
            ratingCoverageCount: row.rating_coverage_count,
            likePercentage: row.watched_count > 0 && ratingsComplete
                ? Math.round((row.liked_count / row.watched_count) * 100)
                : null,
        };
    });
}

export function getChannelStatisticsResponse(now = Date.now()): ChannelStatisticsResponse {
    const integration = getYouTubeIntegration();
    const accountChannelId = integration?.youtubeChannelId ?? null;
    const lastFullSyncAt = accountChannelId
        ? getLastFullYouTubeRatingSyncAt(accountChannelId)
        : null;
    const hasUncheckedWatchedVideos = accountChannelId
        ? listUncheckedWatchedVideoIds(accountChannelId).length > 0
        : false;
    const identificationCounts = getDb().prepare<[], {
        pending_count: number;
        unidentified_count: number;
    }>(
        `SELECT
            SUM(CASE
                WHEN videos.channel_id IS NULL
                 AND (videos.video_id IS NULL OR videos.metadata_checked_at IS NULL)
                THEN 1 ELSE 0 END) AS pending_count,
            SUM(CASE
                WHEN videos.channel_id IS NULL
                 AND videos.video_id IS NOT NULL
                 AND videos.metadata_checked_at IS NOT NULL
                THEN 1 ELSE 0 END) AS unidentified_count
         FROM watched_videos
         LEFT JOIN videos ON videos.video_id = watched_videos.video_id`
    ).get() ?? { pending_count: 0, unidentified_count: 0 };
    const pendingIdentificationCount = identificationCounts.pending_count ?? 0;
    const unidentifiedWatchedCount = identificationCounts.unidentified_count ?? 0;

    return {
        channels: listChannelStatistics(accountChannelId),
        unattributedWatchedCount: pendingIdentificationCount + unidentifiedWatchedCount,
        pendingIdentificationCount,
        unidentifiedWatchedCount,
        ratings: {
            accountChannelId,
            connected: Boolean(integration?.encryptedRefreshToken),
            lastFullSyncAt: lastFullSyncAt == null ? null : new Date(lastFullSyncAt).toISOString(),
            stale: lastFullSyncAt == null
                || now - lastFullSyncAt >= YOUTUBE_RATING_REFRESH_INTERVAL_MS,
            hasUncheckedWatchedVideos,
        },
    };
}
