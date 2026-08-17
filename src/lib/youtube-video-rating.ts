import "server-only";

import { markWatched, unmarkWatched } from "./repository";
import {
    removeWatchedVideoFromYouTubePlaylist,
    requeueVideoInYouTubePlaylist,
} from "./playlist-sync";
import { youtubeRatingGateway } from "./youtube-api-server";
import { getYouTubeAccessToken } from "./youtube-oauth";
import { createYouTubeVideoRatingActions } from "./youtube-video-rating-core";

export const youtubeVideoRatingActions = createYouTubeVideoRatingActions({
    getAccessToken: getYouTubeAccessToken,
    getRating: (accessToken, videoId) => youtubeRatingGateway.getRating(accessToken, videoId),
    setRating: (accessToken, videoId, rating) =>
        youtubeRatingGateway.setRating(accessToken, videoId, rating),
    markWatched,
    unmarkWatched,
    removeFromPlaylist: removeWatchedVideoFromYouTubePlaylist,
    requeueInPlaylist: requeueVideoInYouTubePlaylist,
});
