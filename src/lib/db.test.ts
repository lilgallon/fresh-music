import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrateDatabase } from "./db";

describe("database migrations", () => {
    it("upgrades a v2 sync history without losing existing runs", () => {
        const db = new Database(":memory:");
        db.pragma("foreign_keys = ON");
        db.exec(`
            CREATE TABLE youtube_sync_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trigger TEXT NOT NULL,
                status TEXT NOT NULL,
                phase TEXT NOT NULL,
                started_at INTEGER NOT NULL,
                completed_at INTEGER,
                channels_total INTEGER NOT NULL DEFAULT 0,
                channels_processed INTEGER NOT NULL DEFAULT 0,
                discovered INTEGER NOT NULL DEFAULT 0,
                catalogued INTEGER NOT NULL DEFAULT 0,
                remote_items INTEGER NOT NULL DEFAULT 0,
                pending_adds INTEGER NOT NULL DEFAULT 0,
                pending_removals INTEGER NOT NULL DEFAULT 0,
                added INTEGER NOT NULL DEFAULT 0,
                removed INTEGER NOT NULL DEFAULT 0,
                adopted INTEGER NOT NULL DEFAULT 0,
                skipped_watched INTEGER NOT NULL DEFAULT 0,
                skipped_filtered INTEGER NOT NULL DEFAULT 0,
                skipped_existing INTEGER NOT NULL DEFAULT 0,
                quota_read_units INTEGER NOT NULL DEFAULT 0,
                quota_write_units INTEGER NOT NULL DEFAULT 0,
                error TEXT
            );
            INSERT INTO youtube_sync_runs (trigger, status, phase, started_at, added, removed)
            VALUES ('scheduled', 'completed', 'completed', 1234, 2, 1);
            PRAGMA user_version = 2;
        `);

        migrateDatabase(db);

        expect(db.pragma("user_version", { simple: true })).toBe(5);
        expect(db.prepare(
            "SELECT id, added, removed, video_details_version FROM youtube_sync_runs"
        ).get()).toEqual({ id: 1, added: 2, removed: 1, video_details_version: 0 });
        expect(db.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'youtube_sync_run_videos'"
        ).get()).toEqual({ name: "youtube_sync_run_videos" });
        expect(db.prepare("PRAGMA table_info(youtube_sync_run_videos)").all())
            .toEqual(expect.arrayContaining([expect.objectContaining({ name: "filter_reason" })]));
        expect(db.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'youtube_video_ratings'"
        ).get()).toEqual({ name: "youtube_video_ratings" });
        expect(db.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'youtube_rating_sync_state'"
        ).get()).toEqual({ name: "youtube_rating_sync_state" });

        db.close();
    });
});
