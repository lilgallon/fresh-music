import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
    process.env.DB_PATH = ":memory:";
});
vi.mock("server-only", () => ({}));

import { getDb } from "./db";
import {
    adoptRemoteYouTubePlaylistEntries,
    countActiveUnmanagedYouTubePlaylistEntries,
    listYouTubePlaylistEntries,
} from "./youtube-integration-repository";

describe("existing YouTube playlist adoption", () => {
    beforeEach(() => {
        getDb().prepare("DELETE FROM youtube_playlist_entries").run();
    });

    it("manages current remote videos and retires stale unmanaged entries", () => {
        const insert = getDb().prepare(
            `INSERT INTO youtube_playlist_entries (
                video_id, playlist_item_id, state, managed_by_app
             ) VALUES (?, ?, 'active', 0)`
        );
        insert.run("current", "old-current-item");
        insert.run("stale", "stale-item");

        expect(countActiveUnmanagedYouTubePlaylistEntries()).toBe(2);

        expect(adoptRemoteYouTubePlaylistEntries([
            { id: "current-item", videoId: "current" },
            { id: "new-item", videoId: "new" },
            { id: "duplicate-item", videoId: "new" },
        ])).toBe(2);

        expect(countActiveUnmanagedYouTubePlaylistEntries()).toBe(0);
        expect(listYouTubePlaylistEntries()).toEqual(expect.arrayContaining([
            expect.objectContaining({
                videoId: "current",
                playlistItemId: "current-item",
                state: "active",
                managedByApp: true,
            }),
            expect.objectContaining({
                videoId: "new",
                playlistItemId: "duplicate-item",
                state: "active",
                managedByApp: true,
            }),
            expect.objectContaining({
                videoId: "stale",
                playlistItemId: null,
                state: "removed",
                managedByApp: false,
                removalReason: "external",
            }),
        ]));
    });
});
