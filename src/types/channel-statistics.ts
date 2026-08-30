export interface ChannelStatistic {
    channelId: string;
    name: string;
    thumbnail: string | null;
    followed: boolean;
    watchedCount: number;
    likedCount: number;
    ratingCoverageCount: number;
    likePercentage: number | null;
}

export interface ChannelStatisticsResponse {
    channels: ChannelStatistic[];
    unattributedWatchedCount: number;
    pendingIdentificationCount: number;
    unidentifiedWatchedCount: number;
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
