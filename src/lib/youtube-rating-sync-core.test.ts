import { describe, expect, it, vi } from "vitest";
import {
    runYouTubeRatingSync,
    type YouTubeRatingSyncDependencies,
} from "./youtube-rating-sync-core";
import type { YouTubeRating } from "@/types/youtube-rating";

const NOW = Date.parse("2026-08-30T12:00:00.000Z");

function dependencies(overrides: Partial<YouTubeRatingSyncDependencies> = {}) {
    return {
        youtubeAccountId: "account-a",
        now: () => NOW,
        getLastFullSyncAt: vi.fn().mockReturnValue(null),
        listAllWatchedVideoIds: vi.fn().mockReturnValue([]),
        listUncheckedWatchedVideoIds: vi.fn().mockReturnValue([]),
        getRatings: vi.fn().mockImplementation(async (videoIds: string[]) =>
            new Map<string, YouTubeRating>(videoIds.map((videoId) => [videoId, "none"]))
        ),
        saveRatings: vi.fn(),
        setLastFullSyncAt: vi.fn(),
        ...overrides,
    } satisfies YouTubeRatingSyncDependencies;
}

describe("YouTube rating synchronization", () => {
    it("reads a stale history in batches of 50 and fills missing responses with none", async () => {
        const videoIds = Array.from({ length: 121 }, (_, index) => `video-${index}`);
        const deps = dependencies({
            listAllWatchedVideoIds: vi.fn().mockReturnValue(videoIds),
            getRatings: vi.fn().mockImplementation(async (batch: string[]) =>
                new Map<string, YouTubeRating>(batch.slice(0, -1).map((videoId) => [videoId, "like"]))
            ),
        });

        await expect(runYouTubeRatingSync(deps, false)).resolves.toEqual({
            skipped: false,
            checkedCount: 121,
            lastFullSyncAt: "2026-08-30T12:00:00.000Z",
        });
        expect(deps.getRatings).toHaveBeenCalledTimes(3);
        expect(deps.getRatings.mock.calls.map(([batch]) => batch.length)).toEqual([50, 50, 21]);
        expect(deps.saveRatings).toHaveBeenLastCalledWith(
            "account-a",
            expect.arrayContaining([{ videoId: "video-120", rating: "none" }]),
            NOW
        );
        expect(deps.setLastFullSyncAt).toHaveBeenCalledWith("account-a", NOW);
    });

    it("checks only newly watched videos while the full sync is fresh", async () => {
        const lastFullSyncAt = NOW - 60_000;
        const deps = dependencies({
            getLastFullSyncAt: vi.fn().mockReturnValue(lastFullSyncAt),
            listAllWatchedVideoIds: vi.fn().mockReturnValue(["old"]),
            listUncheckedWatchedVideoIds: vi.fn().mockReturnValue(["new"]),
        });

        await expect(runYouTubeRatingSync(deps, false)).resolves.toEqual({
            skipped: false,
            checkedCount: 1,
            lastFullSyncAt: new Date(lastFullSyncAt).toISOString(),
        });
        expect(deps.listAllWatchedVideoIds).not.toHaveBeenCalled();
        expect(deps.getRatings).toHaveBeenCalledWith(["new"]);
        expect(deps.setLastFullSyncAt).not.toHaveBeenCalled();
    });

    it("skips a fresh and complete history, but force refreshes it", async () => {
        const lastFullSyncAt = NOW - 60_000;
        const skippedDeps = dependencies({
            getLastFullSyncAt: vi.fn().mockReturnValue(lastFullSyncAt),
        });
        await expect(runYouTubeRatingSync(skippedDeps, false)).resolves.toEqual({
            skipped: true,
            checkedCount: 0,
            lastFullSyncAt: new Date(lastFullSyncAt).toISOString(),
        });

        const forcedDeps = dependencies({
            getLastFullSyncAt: vi.fn().mockReturnValue(lastFullSyncAt),
            listAllWatchedVideoIds: vi.fn().mockReturnValue(["video"]),
        });
        await runYouTubeRatingSync(forcedDeps, true);
        expect(forcedDeps.getRatings).toHaveBeenCalledWith(["video"]);
        expect(forcedDeps.setLastFullSyncAt).toHaveBeenCalledWith("account-a", NOW);
    });

    it("does not advance the full-sync timestamp after a failed batch", async () => {
        const deps = dependencies({
            listAllWatchedVideoIds: vi.fn().mockReturnValue(["video"]),
            getRatings: vi.fn().mockRejectedValue(new Error("quota exhausted")),
        });

        await expect(runYouTubeRatingSync(deps, false)).rejects.toThrow("quota exhausted");
        expect(deps.setLastFullSyncAt).not.toHaveBeenCalled();
    });
});
