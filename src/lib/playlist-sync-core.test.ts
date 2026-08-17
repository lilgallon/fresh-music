import { describe, expect, it, vi } from "vitest";
import { createPlaylistSyncRunner, PlaylistSyncStore } from "./playlist-sync-core";
import type {
    DiscoveredYouTubeVideo,
    YouTubeGateway,
    YouTubeRemotePlaylistItem,
} from "./youtube-api-server";
import type {
    YouTubeIntegrationRecord,
    YouTubePlaylistEntry,
} from "./youtube-integration-repository";
import type { YouTubeSyncStatus } from "@/types/youtube-integration";
import { DEFAULT_SETTINGS, type AppSettings } from "../types/settings";

const connectedIntegration: YouTubeIntegrationRecord = {
    youtubeChannelId: "mine",
    youtubeChannelTitle: "Me",
    encryptedRefreshToken: "encrypted",
    playlistId: "playlist",
    playlistTitle: "Fresh Music",
    connectedAt: 1,
    lastSyncStartedAt: null,
    lastSyncCompletedAt: null,
    nextSyncAt: null,
    lastSyncStatus: "idle",
    lastSyncError: null,
    lastSyncAdded: 0,
    lastSyncRemoved: 0,
};

function video(id: string, publishedAt: string): DiscoveredYouTubeVideo {
    return {
        id,
        title: id,
        thumbnail: "",
        channelTitle: "Channel",
        sourceChannelId: "channel",
        publishedAt,
    };
}

class MemoryStore implements PlaylistSyncStore {
    integration: YouTubeIntegrationRecord | null = { ...connectedIntegration };
    watched = new Set<string>();
    entries = new Map<string, YouTubePlaylistEntry>();
    finished: Array<{
        status: YouTubeSyncStatus;
        added: number;
        removed: number;
        error: string | null;
    }> = [];
    settings: AppSettings = { ...DEFAULT_SETTINGS };

    getIntegration() { return this.integration; }
    listChannels() { return [{ channelId: "channel", name: "Channel", isMusicOnly: true }]; }
    listWatched() { return Array.from(this.watched); }
    markWatched(id: string) { this.watched.add(id); }
    getSettings() { return this.settings; }
    listEntries() { return Array.from(this.entries.values()).map((entry) => ({ ...entry })); }
    startSync(startedAt: number) {
        if (this.integration) {
            this.integration.lastSyncStartedAt = startedAt;
            this.integration.lastSyncStatus = "running";
        }
    }
    finishSync(params: {
        completedAt: number;
        nextSyncAt: number | null;
        status: YouTubeSyncStatus;
        added: number;
        removed: number;
        error: string | null;
    }) {
        this.finished.push(params);
        if (this.integration) {
            this.integration.lastSyncCompletedAt = params.completedAt;
            this.integration.nextSyncAt = params.nextSyncAt;
            this.integration.lastSyncStatus = params.status;
            this.integration.lastSyncAdded = params.added;
            this.integration.lastSyncRemoved = params.removed;
            this.integration.lastSyncError = params.error;
        }
    }
    prepareEntry(params: {
        videoId: string;
        sourceChannelId?: string | null;
        publishedAt?: string | null;
        managedByApp?: boolean;
    }) {
        const previous = this.entries.get(params.videoId);
        this.entries.set(params.videoId, {
            videoId: params.videoId,
            sourceChannelId: params.sourceChannelId ?? previous?.sourceChannelId ?? null,
            publishedAt: params.publishedAt ?? previous?.publishedAt ?? null,
            playlistItemId: null,
            state: "adding",
            managedByApp: params.managedByApp !== false,
            removalReason: null,
            lastError: null,
        });
    }
    activateEntry(params: {
        videoId: string;
        playlistItemId: string;
        managedByApp: boolean;
        sourceChannelId?: string | null;
        publishedAt?: string | null;
    }) {
        const previous = this.entries.get(params.videoId);
        this.entries.set(params.videoId, {
            videoId: params.videoId,
            sourceChannelId: params.sourceChannelId ?? previous?.sourceChannelId ?? null,
            publishedAt: params.publishedAt ?? previous?.publishedAt ?? null,
            playlistItemId: params.playlistItemId,
            state: "active",
            managedByApp: params.managedByApp,
            removalReason: null,
            lastError: null,
        });
    }
    markEntryRemoved(
        videoId: string,
        reason: "watched" | "external" | "playlist_recreated" | "filtered"
    ) {
        const previous = this.entries.get(videoId);
        if (!previous) return;
        this.entries.set(videoId, {
            ...previous,
            playlistItemId: null,
            state: "removed",
            removalReason: reason,
            lastError: null,
        });
    }
    setEntryError(videoId: string, error: string) {
        const previous = this.entries.get(videoId);
        if (previous) this.entries.set(videoId, { ...previous, lastError: error });
    }
}

class FakeYouTubeGateway implements YouTubeGateway {
    remoteItems: YouTubeRemotePlaylistItem[] = [];
    discovered: DiscoveredYouTubeVideo[] = [];
    insertOrder: string[] = [];
    deleted: string[] = [];
    deleteError: Error | null = null;
    listError: Error | null = null;
    listBarrier: Promise<void> | null = null;
    playlistExists = true;
    ignoredVideoIds = new Set<string>();
    beforeInsert: ((videoId: string) => void) | null = null;

    async getMyAccount() { return { channelId: "mine", title: "Me" }; }
    async getPlaylist() {
        return this.playlistExists ? { id: "playlist", title: "Fresh Music" } : null;
    }
    async findPrivatePlaylistByTitle() { return null; }
    async createPrivatePlaylist() { return { id: "playlist", title: "Fresh Music" }; }
    async listPlaylistItems() {
        if (this.listBarrier) await this.listBarrier;
        if (this.listError) throw this.listError;
        return this.remoteItems.map((item) => ({ ...item }));
    }
    async insertPlaylistItem(_accessToken: string, _playlistId: string, videoId: string) {
        this.beforeInsert?.(videoId);
        this.insertOrder.push(videoId);
        const id = `item-${videoId}`;
        this.remoteItems.push({ id, videoId });
        return id;
    }
    async deletePlaylistItem(_accessToken: string, playlistItemId: string) {
        if (this.deleteError) throw this.deleteError;
        this.deleted.push(playlistItemId);
        this.remoteItems = this.remoteItems.filter((item) => item.id !== playlistItemId);
    }
    async findIgnoredVideos(_accessToken: string, videoIds: string[]) {
        return videoIds
            .filter((id) => this.ignoredVideoIds.has(id))
            .map((videoId) => ({ videoId, reason: "YouTube Short" }));
    }
    async discoverVideos() {
        return this.discovered
            .filter((item) => !this.ignoredVideoIds.has(item.id))
            .map((item) => ({ ...item }));
    }
}

function runner(
    store: MemoryStore,
    youtube: FakeYouTubeGateway,
    onVideoChange?: (
        action: "added" | "removed" | "filtered",
        videoId: string,
        filterReason?: string
    ) => void
) {
    return createPlaylistSyncRunner({
        store,
        youtube,
        getAccessToken: async () => "access-token",
        now: vi.fn()
            .mockReturnValueOnce(1_000)
            .mockReturnValueOnce(2_000),
        intervalMs: 60_000,
        onVideoChange,
    });
}

describe("playlist synchronization", () => {
    it("adds only unwatched discoveries from oldest to newest", async () => {
        const store = new MemoryStore();
        const youtube = new FakeYouTubeGateway();
        store.watched.add("watched");
        youtube.discovered = [
            video("oldest", "2026-08-01T00:00:00Z"),
            video("watched", "2026-08-02T00:00:00Z"),
            video("newest", "2026-08-03T00:00:00Z"),
        ];

        const result = await runner(store, youtube)();

        expect(youtube.insertOrder).toEqual(["oldest", "newest"]);
        expect(result).toEqual({ added: 2, removed: 0, discovered: 3 });
        expect(store.finished.at(-1)).toMatchObject({ status: "success", added: 2 });
    });

    it("reports successful additions, removals, and filters by video", async () => {
        const store = new MemoryStore();
        const youtube = new FakeYouTubeGateway();
        const changes: Array<[string, string, string | undefined]> = [];
        youtube.ignoredVideoIds.add("filtered");
        youtube.remoteItems = [{ id: "filtered-item", videoId: "filtered" }];
        youtube.discovered = [video("added", "2026-08-02T00:00:00Z")];
        store.entries.set("filtered", {
            videoId: "filtered",
            sourceChannelId: "channel",
            publishedAt: "2026-08-01T00:00:00Z",
            playlistItemId: "filtered-item",
            state: "active",
            managedByApp: true,
            removalReason: null,
            lastError: null,
        });

        await runner(
            store,
            youtube,
            (action, videoId, reason) => changes.push([action, videoId, reason])
        )();

        expect(changes).toEqual([
            ["filtered", "filtered", "YouTube Short"],
            ["removed", "filtered", undefined],
            ["added", "added", undefined],
        ]);
    });

    it("rechecks watched state before every insertion", async () => {
        const store = new MemoryStore();
        const youtube = new FakeYouTubeGateway();
        youtube.discovered = [
            video("first", "2026-08-01T00:00:00Z"),
            video("became-watched", "2026-08-02T00:00:00Z"),
        ];
        youtube.beforeInsert = (videoId) => {
            if (videoId === "first") store.watched.add("became-watched");
        };

        await runner(store, youtube)();

        expect(youtube.insertOrder).toEqual(["first"]);
        expect(store.entries.has("became-watched")).toBe(false);
    });

    it("limits additions without losing remaining discoveries", async () => {
        const store = new MemoryStore();
        const youtube = new FakeYouTubeGateway();
        store.settings.maxPlaylistAddsPerSync = 2;
        youtube.discovered = [
            video("one", "2026-08-01T00:00:00Z"),
            video("two", "2026-08-02T00:00:00Z"),
            video("three", "2026-08-03T00:00:00Z"),
        ];

        await runner(store, youtube)();

        expect(youtube.insertOrder).toEqual(["one", "two"]);
        expect(store.entries.has("three")).toBe(false);
    });

    it("does not duplicate or take ownership of a manually added item", async () => {
        const store = new MemoryStore();
        const youtube = new FakeYouTubeGateway();
        const changes: Array<[string, string]> = [];
        youtube.remoteItems = [{ id: "manual-item", videoId: "release" }];
        youtube.discovered = [video("release", "2026-08-01T00:00:00Z")];

        await runner(store, youtube, (action, videoId) => changes.push([action, videoId]))();

        expect(youtube.insertOrder).toEqual([]);
        expect(store.entries.get("release")).toMatchObject({
            playlistItemId: "manual-item",
            managedByApp: false,
            state: "active",
        });

        youtube.remoteItems = [];
        await runner(store, youtube, (action, videoId) => changes.push([action, videoId]))();
        expect(store.watched.has("release")).toBe(false);
        expect(youtube.insertOrder).toEqual([]);
        expect(changes).toEqual([]);
    });

    it("marks a managed item watched when it was removed in YouTube", async () => {
        const store = new MemoryStore();
        const youtube = new FakeYouTubeGateway();
        const changes: Array<[string, string]> = [];
        store.entries.set("removed", {
            videoId: "removed",
            sourceChannelId: "channel",
            publishedAt: "2026-08-01T00:00:00Z",
            playlistItemId: "gone-item",
            state: "active",
            managedByApp: true,
            removalReason: null,
            lastError: null,
        });

        const result = await runner(
            store,
            youtube,
            (action, videoId) => changes.push([action, videoId])
        )();

        expect(store.watched.has("removed")).toBe(true);
        expect(store.entries.get("removed")).toMatchObject({ state: "removed", removalReason: "external" });
        expect(result.removed).toBe(1);
        expect(changes).toEqual([["removed", "removed"]]);
    });

    it("does not adopt a manual duplicate when the managed playlist item was removed", async () => {
        const store = new MemoryStore();
        const youtube = new FakeYouTubeGateway();
        youtube.remoteItems = [{ id: "manual-duplicate", videoId: "removed" }];
        store.entries.set("removed", {
            videoId: "removed",
            sourceChannelId: "channel",
            publishedAt: "2026-08-01T00:00:00Z",
            playlistItemId: "managed-item-that-is-gone",
            state: "active",
            managedByApp: true,
            removalReason: null,
            lastError: null,
        });

        await runner(store, youtube)();

        expect(store.watched.has("removed")).toBe(true);
        expect(youtube.deleted).toEqual([]);
        expect(youtube.remoteItems).toEqual([{ id: "manual-duplicate", videoId: "removed" }]);
    });

    it("removes an active managed item that was marked watched outside the item route", async () => {
        const store = new MemoryStore();
        const youtube = new FakeYouTubeGateway();
        store.watched.add("imported-watched");
        youtube.remoteItems = [{ id: "imported-item", videoId: "imported-watched" }];
        store.entries.set("imported-watched", {
            videoId: "imported-watched",
            sourceChannelId: "channel",
            publishedAt: "2026-08-01T00:00:00Z",
            playlistItemId: "imported-item",
            state: "active",
            managedByApp: true,
            removalReason: null,
            lastError: null,
        });

        await runner(store, youtube)();

        expect(youtube.deleted).toEqual(["imported-item"]);
        expect(store.entries.get("imported-watched")).toMatchObject({
            state: "removed",
            removalReason: "watched",
        });
    });

    it("removes managed Shorts and live videos without marking them watched", async () => {
        const store = new MemoryStore();
        const youtube = new FakeYouTubeGateway();
        youtube.ignoredVideoIds.add("short-or-live");
        youtube.remoteItems = [{ id: "ignored-item", videoId: "short-or-live" }];
        youtube.discovered = [video("short-or-live", "2026-08-01T00:00:00Z")];
        store.entries.set("short-or-live", {
            videoId: "short-or-live",
            sourceChannelId: "channel",
            publishedAt: "2026-08-01T00:00:00Z",
            playlistItemId: "ignored-item",
            state: "active",
            managedByApp: true,
            removalReason: null,
            lastError: null,
        });

        const result = await runner(store, youtube)();

        expect(youtube.deleted).toEqual(["ignored-item"]);
        expect(store.watched.has("short-or-live")).toBe(false);
        expect(store.entries.get("short-or-live")).toMatchObject({
            state: "removed",
            removalReason: "filtered",
        });
        expect(result.removed).toBe(1);
        expect(youtube.insertOrder).toEqual([]);
    });

    it("keeps a failed deletion pending and retries it on the next sync", async () => {
        const store = new MemoryStore();
        const youtube = new FakeYouTubeGateway();
        youtube.remoteItems = [{ id: "pending-item", videoId: "pending" }];
        store.watched.add("pending");
        store.entries.set("pending", {
            videoId: "pending",
            sourceChannelId: "channel",
            publishedAt: "2026-08-01T00:00:00Z",
            playlistItemId: "pending-item",
            state: "removal_pending",
            managedByApp: true,
            removalReason: null,
            lastError: null,
        });
        youtube.deleteError = new Error("quota exceeded");
        const changes: Array<[string, string]> = [];

        await expect(runner(
            store,
            youtube,
            (action, videoId) => changes.push([action, videoId])
        )()).rejects.toThrow("quota exceeded");
        expect(store.entries.get("pending")).toMatchObject({
            state: "removal_pending",
            lastError: "quota exceeded",
        });
        expect(changes).toEqual([]);

        youtube.deleteError = null;
        await runner(store, youtube)();
        expect(youtube.deleted).toEqual(["pending-item"]);
        expect(store.entries.get("pending")).toMatchObject({ state: "removed", removalReason: "watched" });
    });

    it("adopts a prepared insertion after a crash instead of duplicating it", async () => {
        const store = new MemoryStore();
        const youtube = new FakeYouTubeGateway();
        youtube.remoteItems = [{ id: "existing-item", videoId: "prepared" }];
        store.entries.set("prepared", {
            videoId: "prepared",
            sourceChannelId: "channel",
            publishedAt: "2026-08-01T00:00:00Z",
            playlistItemId: null,
            state: "adding",
            managedByApp: true,
            removalReason: null,
            lastError: null,
        });
        youtube.discovered = [video("prepared", "2026-08-01T00:00:00Z")];

        await runner(store, youtube)();

        expect(youtube.insertOrder).toEqual([]);
        expect(store.entries.get("prepared")).toMatchObject({
            state: "active",
            playlistItemId: "existing-item",
            managedByApp: true,
        });
    });

    it("never inserts a prepared entry that became watched", async () => {
        const store = new MemoryStore();
        const youtube = new FakeYouTubeGateway();
        store.watched.add("prepared-watched");
        store.entries.set("prepared-watched", {
            videoId: "prepared-watched",
            sourceChannelId: "channel",
            publishedAt: "2026-08-01T00:00:00Z",
            playlistItemId: null,
            state: "adding",
            managedByApp: true,
            removalReason: null,
            lastError: null,
        });
        youtube.discovered = [video("prepared-watched", "2026-08-01T00:00:00Z")];

        await runner(store, youtube)();

        expect(youtube.insertOrder).toEqual([]);
        expect(store.entries.get("prepared-watched")).toMatchObject({
            state: "removed",
            removalReason: "watched",
        });
    });

    it("returns the same in-flight promise for concurrent triggers", async () => {
        const store = new MemoryStore();
        const youtube = new FakeYouTubeGateway();
        let release!: () => void;
        youtube.listBarrier = new Promise<void>((resolve) => { release = resolve; });
        const run = runner(store, youtube);

        const first = run();
        const second = run();

        expect(first).toBe(second);
        release();
        await first;
        expect(store.finished).toHaveLength(1);
    });

    it("stops scheduling when Google authorization must be renewed", async () => {
        const store = new MemoryStore();
        const youtube = new FakeYouTubeGateway();
        const authorizationError = new Error("invalid_grant");
        authorizationError.name = "YouTubeAuthorizationError";
        youtube.listError = authorizationError;

        await expect(runner(store, youtube)()).rejects.toThrow("invalid_grant");

        expect(store.finished.at(-1)).toMatchObject({
            status: "reauthorization_required",
            nextSyncAt: null,
        });
    });

    it("stops scheduling when the managed playlist was deleted", async () => {
        const store = new MemoryStore();
        const youtube = new FakeYouTubeGateway();
        const missingError = Object.assign(new Error("playlist not found"), {
            status: 404,
            reason: "playlistNotFound",
        });
        youtube.listError = missingError;
        youtube.playlistExists = false;

        await expect(runner(store, youtube)()).rejects.toThrow("playlist not found");

        expect(store.finished.at(-1)).toMatchObject({
            status: "playlist_missing",
            nextSyncAt: null,
        });
    });

    it("does not report an existing playlist as missing during YouTube propagation", async () => {
        const store = new MemoryStore();
        const youtube = new FakeYouTubeGateway();
        youtube.listError = Object.assign(new Error("playlist not found"), {
            status: 404,
            reason: "playlistNotFound",
        });

        await runner(store, youtube)();

        expect(store.finished.at(-1)).toMatchObject({
            status: "idle",
            nextSyncAt: 62_000,
            error: null,
        });
    });
});
