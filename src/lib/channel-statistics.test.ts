import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
    process.env.DB_PATH = ":memory:";
});
vi.mock("server-only", () => ({}));

import { getDb } from "./db";
import { getChannelStatisticsResponse, listChannelStatistics } from "./channel-statistics";

function addChannel(channelId: string, name: string, thumbnail: string | null = null): void {
    getDb().prepare(
        "INSERT INTO channels (channel_id, name, is_music_only, thumbnail) VALUES (?, ?, 1, ?)"
    ).run(channelId, name, thumbnail);
}

function addVideo(videoId: string, channelId: string | null, channelTitle: string): void {
    getDb().prepare(
        `INSERT INTO videos (
            video_id, channel_id, title, channel_title, thumbnail_url, published_at
         ) VALUES (?, ?, ?, ?, '', '2026-08-01T00:00:00.000Z')`
    ).run(videoId, channelId, `Video ${videoId}`, channelTitle);
}

function markWatched(videoId: string): void {
    getDb().prepare("INSERT INTO watched_videos (video_id) VALUES (?)").run(videoId);
}

function saveRating(accountId: string, videoId: string, rating: string): void {
    getDb().prepare(
        `INSERT INTO youtube_video_ratings (
            youtube_account_id, video_id, rating, checked_at
         ) VALUES (?, ?, ?, ?)`
    ).run(accountId, videoId, rating, Date.now());
}

describe("channel statistics", () => {
    beforeEach(() => {
        const db = getDb();
        db.prepare("DELETE FROM youtube_video_ratings").run();
        db.prepare("DELETE FROM youtube_rating_sync_state").run();
        db.prepare("DELETE FROM watched_videos").run();
        db.prepare("DELETE FROM videos").run();
        db.prepare("DELETE FROM channels").run();
    });

    it("includes followed channels without views and removed channels from history", () => {
        addChannel("followed", "Followed", "https://yt3.ggpht.com/followed.jpg");
        addVideo("old-video", "removed", "Removed");
        markWatched("old-video");
        saveRating("account-a", "old-video", "like");

        expect(listChannelStatistics("account-a")).toEqual(expect.arrayContaining([
            {
                channelId: "followed",
                name: "Followed",
                thumbnail: "https://yt3.ggpht.com/followed.jpg",
                followed: true,
                watchedCount: 0,
                likedCount: 0,
                ratingCoverageCount: 0,
                likePercentage: null,
            },
            {
                channelId: "removed",
                name: "Removed",
                thumbnail: null,
                followed: false,
                watchedCount: 1,
                likedCount: 1,
                ratingCoverageCount: 1,
                likePercentage: 100,
            },
        ]));
    });

    it("computes likes over watched videos only and hides incomplete percentages", () => {
        addChannel("channel", "Channel");
        addVideo("liked", "channel", "Channel");
        addVideo("unknown", "channel", "Channel");
        addVideo("unwatched-liked", "channel", "Channel");
        markWatched("liked");
        markWatched("unknown");
        saveRating("account-a", "liked", "like");
        saveRating("account-a", "unwatched-liked", "like");

        expect(listChannelStatistics("account-a")[0]).toMatchObject({
            watchedCount: 2,
            likedCount: 1,
            ratingCoverageCount: 1,
            likePercentage: null,
        });

        saveRating("account-a", "unknown", "none");
        expect(listChannelStatistics("account-a")[0]).toMatchObject({
            watchedCount: 2,
            likedCount: 1,
            ratingCoverageCount: 2,
            likePercentage: 50,
        });
    });

    it("keeps ratings isolated between YouTube accounts", () => {
        addChannel("channel", "Channel");
        addVideo("video", "channel", "Channel");
        markWatched("video");
        saveRating("account-a", "video", "like");
        saveRating("account-b", "video", "none");

        expect(listChannelStatistics("account-a")[0].likedCount).toBe(1);
        expect(listChannelStatistics("account-b")[0].likedCount).toBe(0);
    });

    it("does not create a synthetic channel for unattributed watched videos", () => {
        addVideo("unknown", null, "");
        markWatched("unknown");
        expect(listChannelStatistics("account-a")).toEqual([]);
    });

    it("distinguishes pending metadata from videos that remain unidentifiable", () => {
        addVideo("pending", null, "");
        addVideo("unidentified", null, "");
        markWatched("pending");
        markWatched("unidentified");
        getDb().prepare(
            "UPDATE videos SET metadata_checked_at = unixepoch() WHERE video_id = ?"
        ).run("unidentified");

        expect(getChannelStatisticsResponse()).toMatchObject({
            unattributedWatchedCount: 2,
            pendingIdentificationCount: 1,
            unidentifiedWatchedCount: 1,
        });
    });
});
