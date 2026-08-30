export interface ChannelStatistic {
    channelId: string;
    name: string;
    followed: boolean;
    watchedCount: number;
    likedCount: number;
    ratingCoverageCount: number;
    likePercentage: number | null;
}

export interface ChannelStatisticsResponse {
    channels: ChannelStatistic[];
    unattributedWatchedCount: number;
    ratings: {
        accountChannelId: string | null;
        connected: boolean;
        lastFullSyncAt: string | null;
        stale: boolean;
        hasUncheckedWatchedVideos: boolean;
    };
}

export interface YouTubeRatingSyncResult {
    skipped: boolean;
    checkedCount: number;
    lastFullSyncAt: string | null;
}
