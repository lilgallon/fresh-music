import type { KnownYouTubeRating } from "./youtube-rating-repository";
import type { YouTubeRatingSyncResult } from "@/types/channel-statistics";
import type { YouTubeRating } from "@/types/youtube-rating";

export const YOUTUBE_RATING_BATCH_SIZE = 50;
export const YOUTUBE_RATING_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface YouTubeRatingSyncDependencies {
    youtubeAccountId: string;
    now(): number;
    getLastFullSyncAt(youtubeAccountId: string): number | null;
    listAllWatchedVideoIds(): string[];
    listUncheckedWatchedVideoIds(youtubeAccountId: string): string[];
    getRatings(videoIds: string[]): Promise<Map<string, YouTubeRating>>;
    saveRatings(youtubeAccountId: string, ratings: KnownYouTubeRating[], checkedAt: number): void;
    setLastFullSyncAt(youtubeAccountId: string, timestamp: number): void;
}

function toIso(timestamp: number | null): string | null {
    return timestamp == null ? null : new Date(timestamp).toISOString();
}

export async function runYouTubeRatingSync(
    dependencies: YouTubeRatingSyncDependencies,
    force: boolean
): Promise<YouTubeRatingSyncResult> {
    const now = dependencies.now();
    const previousFullSyncAt = dependencies.getLastFullSyncAt(dependencies.youtubeAccountId);
    const needsFullSync = force
        || previousFullSyncAt == null
        || now - previousFullSyncAt >= YOUTUBE_RATING_REFRESH_INTERVAL_MS;
    const videoIds = needsFullSync
        ? dependencies.listAllWatchedVideoIds()
        : dependencies.listUncheckedWatchedVideoIds(dependencies.youtubeAccountId);

    if (videoIds.length === 0) {
        if (needsFullSync) {
            dependencies.setLastFullSyncAt(dependencies.youtubeAccountId, now);
        }
        return {
            skipped: !needsFullSync,
            checkedCount: 0,
            lastFullSyncAt: toIso(needsFullSync ? now : previousFullSyncAt),
        };
    }

    for (let index = 0; index < videoIds.length; index += YOUTUBE_RATING_BATCH_SIZE) {
        const batch = videoIds.slice(index, index + YOUTUBE_RATING_BATCH_SIZE);
        const remoteRatings = await dependencies.getRatings(batch);
        dependencies.saveRatings(
            dependencies.youtubeAccountId,
            batch.map((videoId) => ({
                videoId,
                rating: remoteRatings.get(videoId) ?? "none",
            })),
            now
        );
    }

    if (needsFullSync) {
        dependencies.setLastFullSyncAt(dependencies.youtubeAccountId, now);
    }
    return {
        skipped: false,
        checkedCount: videoIds.length,
        lastFullSyncAt: toIso(needsFullSync ? now : previousFullSyncAt),
    };
}
