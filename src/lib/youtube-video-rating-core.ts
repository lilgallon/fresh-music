import type { YouTubeLikeResult, YouTubeRating } from "@/types/youtube-rating";

export interface YouTubeVideoRatingDependencies {
    getAccessToken(): Promise<string>;
    getRating(accessToken: string, videoId: string): Promise<YouTubeRating>;
    setRating(accessToken: string, videoId: string, rating: YouTubeRating): Promise<void>;
    markWatched(videoId: string): void;
    unmarkWatched(videoId: string): void;
    saveRating(videoId: string, rating: YouTubeRating): void;
    removeFromPlaylist(videoId: string): Promise<void>;
    requeueInPlaylist(videoId: string): Promise<void>;
}
export function createYouTubeVideoRatingActions(dependencies: YouTubeVideoRatingDependencies) {
    return {
        async like(videoId: string): Promise<YouTubeLikeResult> {
            const accessToken = await dependencies.getAccessToken();
            const previousRating = await dependencies.getRating(accessToken, videoId);
            const ratingChanged = previousRating !== "like";

            if (ratingChanged) {
                await dependencies.setRating(accessToken, videoId, "like");
            }

            let watchedWasMarked = false;
            try {
                dependencies.markWatched(videoId);
                watchedWasMarked = true;
                await dependencies.removeFromPlaylist(videoId);
                dependencies.saveRating(videoId, "like");
            } catch (error) {
                if (watchedWasMarked) {
                    dependencies.unmarkWatched(videoId);
                    await dependencies.requeueInPlaylist(videoId);
                }
                if (ratingChanged) {
                    await dependencies.setRating(accessToken, videoId, previousRating);
                }
                dependencies.saveRating(videoId, previousRating);
                throw error;
            }

            return { previousRating, ratingChanged };
        },

        async undoLike(videoId: string, previousRating: YouTubeRating): Promise<void> {
            const accessToken = await dependencies.getAccessToken();
            const ratingChanged = previousRating !== "like";

            if (ratingChanged) {
                await dependencies.setRating(accessToken, videoId, previousRating);
            }

            let watchedWasUnmarked = false;
            try {
                dependencies.unmarkWatched(videoId);
                watchedWasUnmarked = true;
                await dependencies.requeueInPlaylist(videoId);
                dependencies.saveRating(videoId, previousRating);
            } catch (error) {
                if (watchedWasUnmarked) {
                    dependencies.markWatched(videoId);
                    await dependencies.removeFromPlaylist(videoId);
                }
                if (ratingChanged) {
                    await dependencies.setRating(accessToken, videoId, "like");
                }
                dependencies.saveRating(videoId, "like");
                throw error;
            }
        },
    };
}
