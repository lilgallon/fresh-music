import "server-only";

import { markWatched, unmarkWatched } from "./repository";
import {
    removeWatchedVideoFromYouTubePlaylist,
    requeueVideoInYouTubePlaylist,
} from "./playlist-sync";
import { youtubeRatingGateway } from "./youtube-api-server";
import { getYouTubeAccessToken } from "./youtube-oauth";
import { createYouTubeVideoRatingActions } from "./youtube-video-rating-core";
import { getYouTubeIntegration } from "./youtube-integration-repository";
import { saveYouTubeRating } from "./youtube-rating-repository";

function saveRatingForCurrentAccount(videoId: string, rating: "like" | "dislike" | "none"): void {
    const youtubeAccountId = getYouTubeIntegration()?.youtubeChannelId;
    if (!youtubeAccountId) throw new Error("No YouTube account is connected");
    saveYouTubeRating(youtubeAccountId, videoId, rating);
}

export const youtubeVideoRatingActions = createYouTubeVideoRatingActions({
    getAccessToken: getYouTubeAccessToken,
    getRating: (accessToken, videoId) => youtubeRatingGateway.getRating(accessToken, videoId),
    setRating: (accessToken, videoId, rating) =>
        youtubeRatingGateway.setRating(accessToken, videoId, rating),
    markWatched,
    unmarkWatched,
    saveRating: saveRatingForCurrentAccount,
    removeFromPlaylist: removeWatchedVideoFromYouTubePlaylist,
    requeueInPlaylist: requeueVideoInYouTubePlaylist,
});
