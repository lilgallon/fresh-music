import "server-only";

import { youtubeRatingGateway } from "./youtube-api-server";
import { getYouTubeIntegration } from "./youtube-integration-repository";
import { getYouTubeAccessToken } from "./youtube-oauth";
import {
    getLastFullYouTubeRatingSyncAt,
    listUncheckedWatchedVideoIds,
    listWatchedVideoIds,
    saveYouTubeRatings,
    setLastFullYouTubeRatingSyncAt,
} from "./youtube-rating-repository";
import { runYouTubeRatingSync } from "./youtube-rating-sync-core";
import type { YouTubeRatingSyncResult } from "@/types/channel-statistics";

let runningSync: Promise<YouTubeRatingSyncResult> | null = null;

async function executeYouTubeRatingSync(force: boolean): Promise<YouTubeRatingSyncResult> {
    const integration = getYouTubeIntegration();
    if (!integration?.encryptedRefreshToken || !integration.youtubeChannelId) {
        throw new Error("No YouTube account is connected");
    }
    const accessToken = await getYouTubeAccessToken();
    return runYouTubeRatingSync({
        youtubeAccountId: integration.youtubeChannelId,
        now: Date.now,
        getLastFullSyncAt: getLastFullYouTubeRatingSyncAt,
        listAllWatchedVideoIds: listWatchedVideoIds,
        listUncheckedWatchedVideoIds,
        getRatings: (videoIds) => youtubeRatingGateway.getRatings(accessToken, videoIds),
        saveRatings: saveYouTubeRatings,
        setLastFullSyncAt: setLastFullYouTubeRatingSyncAt,
    }, force);
}

export function synchronizeYouTubeRatings(force = false): Promise<YouTubeRatingSyncResult> {
    if (runningSync) return runningSync;
    runningSync = executeYouTubeRatingSync(force).finally(() => {
        runningSync = null;
    });
    return runningSync;
}
