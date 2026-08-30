import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
    process.env.DB_PATH = ":memory:";
});
vi.mock("server-only", () => ({}));

import { getDb } from "./db";
import {
    listCatalogVideos,
    listCatalogFilterReasons,
    listEligibleUnwatchedCatalogVideos,
    listIneligibleCatalogVideoIds,
    listWatchedIdsMissingCatalog,
    markLegacyHistoryEnriched,
    upsertCatalogVideos,
} from "./catalog-repository";
import {
    getLatestSyncRun,
    recordSyncRunVideos,
    startSyncRun,
    trimSyncRuns,
} from "./sync-run-repository";
import { DEFAULT_SETTINGS } from "../types/settings";

const now = new Date().toISOString();

function addCatalogVideo(
    id: string,
    channelId: string,
    title = `Video ${id}`,
    publishedAt = now
): void {
    upsertCatalogVideos([{
        id,
        channelId,
        title,
        channelTitle: `Channel ${channelId}`,
        thumbnail: "",
        publishedAt,
        durationSeconds: 240,
        liveStatus: "none",
        isShort: false,
    }]);
}

function addChannel(channelId: string): void {
    getDb().prepare(
        "INSERT INTO channels (channel_id, name, is_music_only) VALUES (?, ?, 1)"
    ).run(channelId, `Channel ${channelId}`);
}

function removeChannel(channelId: string): void {
    getDb().prepare("DELETE FROM channels WHERE channel_id = ?").run(channelId);
}

describe("catalogue channel scope", () => {
    beforeEach(() => {
        const db = getDb();
        db.prepare("DELETE FROM youtube_sync_run_videos").run();
        db.prepare("DELETE FROM youtube_sync_runs").run();
        db.prepare("DELETE FROM watched_videos").run();
        db.prepare("DELETE FROM videos").run();
        db.prepare("DELETE FROM channels").run();
    });

    it("keeps the New catalogue synchronized with followed channels", () => {
        addChannel("channel-a");
        addChannel("channel-b");
        addCatalogVideo("video-a", "channel-a");
        addCatalogVideo("video-b", "channel-b");

        expect(listCatalogVideos("new", DEFAULT_SETTINGS, 50, 0).videos.map((video) => video.id))
            .toEqual(["video-a", "video-b"]);

        removeChannel("channel-a");
        expect(listCatalogVideos("new", DEFAULT_SETTINGS, 50, 0).videos.map((video) => video.id))
            .toEqual(["video-b"]);

        addChannel("channel-a");
        expect(listCatalogVideos("new", DEFAULT_SETTINGS, 50, 0).videos.map((video) => video.id))
            .toEqual(["video-a", "video-b"]);
    });

    it("retains watched history after a channel is removed", () => {
        addChannel("channel-a");
        addCatalogVideo("video-a", "channel-a");
        getDb().prepare("INSERT INTO watched_videos (video_id) VALUES (?)").run("video-a");

        removeChannel("channel-a");

        expect(listCatalogVideos("history", DEFAULT_SETTINGS, 50, 0).videos.map((video) => video.id))
            .toEqual(["video-a"]);
    });

    it("keeps watched placeholders imported after legacy enrichment eligible for metadata", () => {
        markLegacyHistoryEnriched();
        getDb().prepare("INSERT INTO watched_videos (video_id) VALUES (?)").run("late-import");
        getDb().prepare(
            `INSERT INTO videos (
                video_id, title, channel_title, thumbnail_url, availability_status,
                discovered_at, metadata_checked_at, updated_at
             ) VALUES (?, 'Video pending metadata', '', '', 'unavailable', unixepoch(), NULL, unixepoch())`
        ).run("late-import");

        expect(listWatchedIdsMissingCatalog()).toContain("late-import");
    });

    it("excludes removed channels from playlist candidates and marks their entries filtered", () => {
        addChannel("channel-a");
        addChannel("channel-b");
        addCatalogVideo("video-a", "channel-a");
        addCatalogVideo("video-b", "channel-b");
        removeChannel("channel-a");

        expect(listEligibleUnwatchedCatalogVideos(DEFAULT_SETTINGS).map((video) => video.id))
            .toEqual(["video-b"]);
        expect(listIneligibleCatalogVideoIds(["video-a", "video-b"], DEFAULT_SETTINGS))
            .toEqual(new Set(["video-a"]));
        expect(listCatalogFilterReasons(["video-a", "video-b"], {
            ...DEFAULT_SETTINGS,
            minimumDurationSeconds: 300,
        })).toEqual(new Map([
            ["video-a", "Channel is no longer followed"],
            ["video-b", "Shorter than 300 seconds"],
        ]));
    });

    it("uses the same global regex semantics for catalogue eligibility", () => {
        addChannel("channel-a");
        addCatalogVideo("video-a", "channel-a", "Artist - OFFICIAL AUDIO");
        addCatalogVideo("video-b", "channel-a", "Artist - Album Track");
        const settings = {
            ...DEFAULT_SETTINGS,
            excludedTitleTerms: ["(official audio|live session)$"],
            excludedTitleRegexEnabled: true,
        };

        expect(listCatalogFilterReasons(["video-a", "video-b"], settings)).toEqual(new Map([
            ["video-a", "Title matches regular expression “(official audio|live session)$”"],
        ]));
        expect(listEligibleUnwatchedCatalogVideos(settings).map((video) => video.id))
            .toEqual(["video-b"]);
    });

    it("returns an exact New count independently of tab and pagination", () => {
        addChannel("channel-a");
        addChannel("channel-removed");
        addCatalogVideo("new-a", "channel-a");
        addCatalogVideo(
            "new-b",
            "channel-a",
            "Video new-b",
            new Date(new Date(now).getTime() - 1_000).toISOString()
        );
        addCatalogVideo("watched", "channel-a");
        addCatalogVideo("filtered", "channel-a", "Album teaser");
        addCatalogVideo("old", "channel-a", "Old release", "2025-01-01T00:00:00.000Z");
        addCatalogVideo("removed", "channel-removed");
        removeChannel("channel-removed");
        getDb().prepare("INSERT INTO watched_videos (video_id) VALUES (?)").run("watched");
        const settings = {
            ...DEFAULT_SETTINGS,
            excludedTitleTerms: ["teaser"],
        };

        expect(listCatalogVideos("new", settings, 1, 0)).toMatchObject({
            newCount: 2,
            nextCursor: "1",
            videos: [{ id: "new-a" }],
        });
        expect(listCatalogVideos("history", settings, 50, 0)).toMatchObject({
            newCount: 2,
            videos: [{ id: "watched" }],
        });

        getDb().prepare("DELETE FROM watched_videos WHERE video_id = ?").run("watched");
        expect(listCatalogVideos("new", settings, 50, 0).newCount).toBe(3);
    });
});

describe("sync run video details", () => {
    beforeEach(() => {
        const db = getDb();
        db.prepare("DELETE FROM youtube_sync_run_videos").run();
        db.prepare("DELETE FROM youtube_sync_runs").run();
        db.prepare("DELETE FROM videos").run();
        db.prepare("DELETE FROM channels").run();
    });

    it("stores deduplicated, enriched video lists and allows category overlap", () => {
        addChannel("channel-a");
        addCatalogVideo("video-a", "channel-a");
        const runId = startSyncRun("manual", 1);

        recordSyncRunVideos(runId, "added", ["video-a", "video-a"]);
        recordSyncRunVideos(runId, "removed", ["video-a"]);
        recordSyncRunVideos(runId, "filtered", [{
            videoId: "video-a",
            filterReason: "YouTube Short",
        }]);

        expect(getLatestSyncRun()).toMatchObject({
            videoDetailsAvailable: true,
            addedVideos: [{
                id: "video-a",
                title: "Video video-a",
                channelTitle: "Channel channel-a",
                filterReason: null,
            }],
            removedVideos: [{
                id: "video-a",
                title: "Video video-a",
                channelTitle: "Channel channel-a",
                filterReason: null,
            }],
            filteredVideos: [{
                id: "video-a",
                title: "Video video-a",
                channelTitle: "Channel channel-a",
                filterReason: "YouTube Short",
            }],
        });
    });

    it("marks video details as unavailable for a run created before v3", () => {
        getDb().prepare(
            `INSERT INTO youtube_sync_runs (
                trigger, status, phase, started_at, video_details_version
             ) VALUES ('scheduled', 'completed', 'completed', ?, 0)`
        ).run(Date.now());

        expect(getLatestSyncRun()).toMatchObject({
            videoDetailsAvailable: false,
            addedVideos: [],
            removedVideos: [],
            filteredVideos: [],
        });
    });

    it("removes video details when runs are trimmed to the latest 30", () => {
        let firstRunId = 0;
        for (let index = 0; index < 31; index += 1) {
            const runId = startSyncRun("scheduled", 0);
            if (index === 0) firstRunId = runId;
        }
        recordSyncRunVideos(firstRunId, "added", ["orphan"]);

        trimSyncRuns();

        expect(getDb().prepare("SELECT COUNT(*) AS count FROM youtube_sync_runs").get())
            .toEqual({ count: 30 });
        expect(getDb().prepare("SELECT COUNT(*) AS count FROM youtube_sync_run_videos").get())
            .toEqual({ count: 0 });
    });
});
