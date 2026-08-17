import { describe, expect, it, vi } from "vitest";
import type { YouTubeRating } from "@/types/youtube-rating";
import {
    createYouTubeVideoRatingActions,
    type YouTubeVideoRatingDependencies,
} from "./youtube-video-rating-core";

function dependencies(previousRating: YouTubeRating = "none") {
    return {
        getAccessToken: vi.fn().mockResolvedValue("token"),
        getRating: vi.fn().mockResolvedValue(previousRating),
        setRating: vi.fn().mockResolvedValue(undefined),
        markWatched: vi.fn(),
        unmarkWatched: vi.fn(),
        removeFromPlaylist: vi.fn().mockResolvedValue(undefined),
        requeueInPlaylist: vi.fn().mockResolvedValue(undefined),
    } satisfies YouTubeVideoRatingDependencies;
}

describe("YouTube video rating actions", () => {
    it("does not inspect or mutate anything without a connected account", async () => {
        const deps = dependencies("none");
        deps.getAccessToken.mockRejectedValueOnce(new Error("YouTube account not connected"));
        const actions = createYouTubeVideoRatingActions(deps);

        await expect(actions.like("video")).rejects.toThrow("not connected");
        expect(deps.getRating).not.toHaveBeenCalled();
        expect(deps.setRating).not.toHaveBeenCalled();
        expect(deps.markWatched).not.toHaveBeenCalled();
    });

    it("likes first, then marks the video watched", async () => {
        const deps = dependencies("none");
        const actions = createYouTubeVideoRatingActions(deps);

        await expect(actions.like("video")).resolves.toEqual({
            previousRating: "none",
            ratingChanged: true,
        });
        expect(deps.setRating).toHaveBeenCalledWith("token", "video", "like");
        expect(deps.markWatched).toHaveBeenCalledWith("video");
        expect(deps.removeFromPlaylist).toHaveBeenCalledWith("video");
        expect(deps.setRating.mock.invocationCallOrder[0]).toBeLessThan(
            deps.markWatched.mock.invocationCallOrder[0]
        );
    });

    it("preserves a pre-existing like without another write", async () => {
        const deps = dependencies("like");
        const actions = createYouTubeVideoRatingActions(deps);

        await expect(actions.like("video")).resolves.toEqual({
            previousRating: "like",
            ratingChanged: false,
        });
        expect(deps.setRating).not.toHaveBeenCalled();
        expect(deps.markWatched).toHaveBeenCalledOnce();
    });

    it("does not mark watched when the quota blocks the YouTube write", async () => {
        const deps = dependencies("none");
        deps.setRating.mockRejectedValueOnce(new Error("YouTube write budget exhausted"));
        const actions = createYouTubeVideoRatingActions(deps);

        await expect(actions.like("video")).rejects.toThrow("write budget exhausted");
        expect(deps.markWatched).not.toHaveBeenCalled();
    });

    it("compensates both states when the watched workflow fails", async () => {
        const deps = dependencies("dislike");
        deps.removeFromPlaylist.mockRejectedValueOnce(new Error("local failure"));
        const actions = createYouTubeVideoRatingActions(deps);

        await expect(actions.like("video")).rejects.toThrow("local failure");
        expect(deps.unmarkWatched).toHaveBeenCalledWith("video");
        expect(deps.requeueInPlaylist).toHaveBeenCalledWith("video");
        expect(deps.setRating).toHaveBeenLastCalledWith("token", "video", "dislike");
    });

    it("restores a previous dislike before unmarking watched", async () => {
        const deps = dependencies();
        const actions = createYouTubeVideoRatingActions(deps);

        await actions.undoLike("video", "dislike");

        expect(deps.setRating).toHaveBeenCalledWith("token", "video", "dislike");
        expect(deps.unmarkWatched).toHaveBeenCalledWith("video");
        expect(deps.requeueInPlaylist).toHaveBeenCalledWith("video");
        expect(deps.setRating.mock.invocationCallOrder[0]).toBeLessThan(
            deps.unmarkWatched.mock.invocationCallOrder[0]
        );
    });

    it("leaves a pre-existing like untouched during undo", async () => {
        const deps = dependencies();
        const actions = createYouTubeVideoRatingActions(deps);

        await actions.undoLike("video", "like");

        expect(deps.setRating).not.toHaveBeenCalled();
        expect(deps.unmarkWatched).toHaveBeenCalledWith("video");
    });

    it("keeps the Fresh Music state unchanged when restoring the rating fails", async () => {
        const deps = dependencies();
        deps.setRating.mockRejectedValueOnce(new Error("rating restore failed"));
        const actions = createYouTubeVideoRatingActions(deps);

        await expect(actions.undoLike("video", "dislike")).rejects.toThrow("rating restore failed");
        expect(deps.unmarkWatched).not.toHaveBeenCalled();
        expect(deps.requeueInPlaylist).not.toHaveBeenCalled();
    });
});
