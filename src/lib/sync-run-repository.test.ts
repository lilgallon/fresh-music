import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
    process.env.DB_PATH = ":memory:";
});
vi.mock("server-only", () => ({}));

import { getDb } from "./db";
import {
    getSyncRunSummary,
    recordSyncRunVideos,
    SYNC_RUN_SUMMARY_WINDOW_MS,
    trimSyncRuns,
} from "./sync-run-repository";

const NOW = Date.UTC(2026, 9, 17, 12);
const DAY = 24 * 60 * 60 * 1000;

function insertRun(startedAt: number, status: string, added: number, removed: number): number {
    const result = getDb().prepare(
        `INSERT INTO youtube_sync_runs (
            trigger, status, phase, started_at, completed_at, added, removed, video_details_version
         ) VALUES ('scheduled', ?, ?, ?, ?, ?, ?, 1)`
    ).run(status, status, startedAt, startedAt + 1000, added, removed);
    return Number(result.lastInsertRowid);
}

describe("weekly sync run summary", () => {
    beforeEach(() => {
        getDb().prepare("DELETE FROM youtube_sync_run_videos").run();
        getDb().prepare("DELETE FROM youtube_sync_runs").run();
    });

    it("aggregates runs from the last 7 days and deduplicates videos", () => {
        const old = insertRun(NOW - 8 * DAY, "completed", 9, 9);
        recordSyncRunVideos(old, "added", ["too-old"]);
        const first = insertRun(NOW - 3 * DAY, "completed", 2, 1);
        recordSyncRunVideos(first, "added", ["a", "b"]);
        recordSyncRunVideos(first, "removed", ["c"]);
        recordSyncRunVideos(first, "filtered", [{ videoId: "f", filterReason: "Old reason" }]);
        const second = insertRun(NOW - DAY, "failed", 1, 0);
        recordSyncRunVideos(second, "added", ["d"]);
        recordSyncRunVideos(second, "filtered", [{ videoId: "f", filterReason: "New reason" }]);

        const summary = getSyncRunSummary(NOW);

        expect(summary).toMatchObject({
            since: NOW - SYNC_RUN_SUMMARY_WINDOW_MS,
            runs: 2,
            completedRuns: 1,
            failedRuns: 1,
            added: 3,
            removed: 1,
            videoDetailsAvailable: true,
        });
        expect(summary.addedVideos.map((video) => video.id)).toEqual(["d", "a", "b"]);
        expect(summary.removedVideos.map((video) => video.id)).toEqual(["c"]);
        expect(summary.filteredVideos).toEqual([
            expect.objectContaining({ id: "f", filterReason: "New reason" }),
        ]);
    });

    it("returns an empty summary without runs", () => {
        expect(getSyncRunSummary(NOW)).toMatchObject({
            runs: 0,
            added: 0,
            removed: 0,
            videoDetailsAvailable: false,
            addedVideos: [],
        });
    });

    it("keeps every run of the summary window when trimming", () => {
        for (let index = 0; index < 5; index += 1) insertRun(NOW - 10 * DAY + index, "completed", 0, 0);
        for (let index = 0; index < 40; index += 1) insertRun(NOW - DAY + index, "completed", 0, 0);

        trimSyncRuns(NOW);

        const count = getDb().prepare("SELECT COUNT(*) AS count FROM youtube_sync_runs").get() as { count: number };
        expect(count.count).toBe(40);
    });
});
