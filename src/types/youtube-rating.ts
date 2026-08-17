export type YouTubeRating = "like" | "dislike" | "none";

export interface YouTubeLikeResult {
    previousRating: YouTubeRating;
    ratingChanged: boolean;
}
