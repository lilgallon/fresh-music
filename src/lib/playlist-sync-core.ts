import type { YouTubeChannel } from "@/types/youtube";
import type { YouTubeSyncResult, YouTubeSyncStatus } from "@/types/youtube-integration";
import type {
    YouTubeGateway,
    YouTubeRemotePlaylistItem,
} from "./youtube-api-server";
import type {
    PlaylistEntryState,
    YouTubeIntegrationRecord,
    YouTubePlaylistEntry,
} from "./youtube-integration-repository";
import type { AppSettings } from "@/types/settings";
import type { YouTubeSyncPhase } from "@/types/youtube-integration";

export interface PlaylistSyncStore {
    getIntegration(): YouTubeIntegrationRecord | null;
    listChannels(): YouTubeChannel[];
    listWatched(): string[];
    markWatched(videoId: string): void;
    getSettings(): AppSettings;
    listEntries(): YouTubePlaylistEntry[];
    prepareEntry(params: {
        videoId: string;
        sourceChannelId?: string | null;
        publishedAt?: string | null;
        managedByApp?: boolean;
    }): void;
    activateEntry(params: {
        videoId: string;
        playlistItemId: string;
        managedByApp: boolean;
        sourceChannelId?: string | null;
        publishedAt?: string | null;
    }): void;
    markEntryRemoved(
        videoId: string,
        reason: "watched" | "external" | "playlist_recreated" | "filtered"
    ): void;
    setEntryError(videoId: string, error: string): void;
    startSync(startedAt: number): void;
    finishSync(params: {
        completedAt: number;
        nextSyncAt: number | null;
        status: YouTubeSyncStatus;
        added: number;
        removed: number;
        error: string | null;
    }): void;
}

export interface PlaylistSyncDependencies {
    store: PlaylistSyncStore;
    youtube: YouTubeGateway;
    getAccessToken(): Promise<string>;
    now(): number;
    intervalMs: number;
    onProgress?: (phase: YouTubeSyncPhase, values?: Record<string, number>) => void;
    onVideoChange?: (
        action: "added" | "removed" | "filtered",
        videoId: string,
        filterReason?: string
    ) => void;
}

export class PlaylistSyncConfigurationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PlaylistSyncConfigurationError";
    }
}

function findRemoteItem(
    remoteItems: YouTubeRemotePlaylistItem[],
    entry: YouTubePlaylistEntry
): YouTubeRemotePlaylistItem | undefined {
    if (entry.playlistItemId) {
        return remoteItems.find((item) => item.id === entry.playlistItemId);
    }
    return remoteItems.find((item) => item.videoId === entry.videoId);
}

interface ClassifiedSyncError {
    status: YouTubeSyncStatus;
    error: string | null;
    shouldThrow: boolean;
}

function isPlaylistMissingError(error: unknown): boolean {
    const apiError = error as { status?: number; reason?: string | null };
    return apiError.reason === "playlistNotFound"
        || (apiError.status === 404 && !apiError.reason);
}

async function classifySyncError(
    dependencies: PlaylistSyncDependencies,
    error: unknown,
    accessToken: string | null,
    playlistId: string
): Promise<ClassifiedSyncError> {
    if (error instanceof PlaylistSyncConfigurationError) {
        return { status: "error", error: getErrorMessage(error), shouldThrow: true };
    }
    if (error instanceof Error && error.name === "YouTubeAuthorizationError") {
        return {
            status: "reauthorization_required",
            error: getErrorMessage(error),
            shouldThrow: true,
        };
    }

    const apiError = error as { status?: number; reason?: string | null };
    if (apiError.status === 401) {
        return {
            status: "reauthorization_required",
            error: getErrorMessage(error),
            shouldThrow: true,
        };
    }
    if (isPlaylistMissingError(error) && accessToken) {
        try {
            const playlist = await dependencies.youtube.getPlaylist(accessToken, playlistId);
            if (playlist) {
                // A newly created playlist can be visible through playlists.list before
                // playlistItems.list accepts it. Keep the integration usable and retry later.
                return { status: "idle", error: null, shouldThrow: false };
            }
            return {
                status: "playlist_missing",
                error: "The Fresh Music playlist could not be found on YouTube.",
                shouldThrow: true,
            };
        } catch {
            // If the verification itself is inconclusive, do not invite the user to create
            // another playlist. A regular sync error remains retryable.
            return { status: "error", error: getErrorMessage(error), shouldThrow: true };
        }
    }
    return { status: "error", error: getErrorMessage(error), shouldThrow: true };
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Unknown YouTube synchronization error";
}

async function deletePendingEntry(
    dependencies: PlaylistSyncDependencies,
    accessToken: string,
    remoteItems: YouTubeRemotePlaylistItem[],
    entry: YouTubePlaylistEntry,
    reason: "watched" | "filtered" = "watched"
): Promise<boolean> {
    const remote = findRemoteItem(remoteItems, entry);
    if (remote) {
        try {
            await dependencies.youtube.deletePlaylistItem(accessToken, remote.id);
        } catch (error) {
            const apiError = error as { status?: number; reason?: string | null };
            if (apiError.status !== 404 && apiError.reason !== "videoNotFound") {
                dependencies.store.setEntryError(entry.videoId, getErrorMessage(error));
                throw error;
            }
        }
    }
    dependencies.store.markEntryRemoved(entry.videoId, reason);
    if (remote) dependencies.onVideoChange?.("removed", entry.videoId);
    return Boolean(remote);
}

async function insertPreparedEntry(
    dependencies: PlaylistSyncDependencies,
    accessToken: string,
    playlistId: string,
    remoteItems: YouTubeRemotePlaylistItem[],
    entry: YouTubePlaylistEntry
): Promise<boolean> {
    const remote = remoteItems.find((item) => item.videoId === entry.videoId);
    if (remote) {
        dependencies.store.activateEntry({
            videoId: entry.videoId,
            playlistItemId: remote.id,
            managedByApp: entry.managedByApp,
            sourceChannelId: entry.sourceChannelId,
            publishedAt: entry.publishedAt,
        });
        return false;
    }

    try {
        const playlistItemId = await dependencies.youtube.insertPlaylistItem(
            accessToken,
            playlistId,
            entry.videoId
        );
        dependencies.store.activateEntry({
            videoId: entry.videoId,
            playlistItemId,
            managedByApp: true,
            sourceChannelId: entry.sourceChannelId,
            publishedAt: entry.publishedAt,
        });
        dependencies.onVideoChange?.("added", entry.videoId);
        remoteItems.push({ id: playlistItemId, videoId: entry.videoId });
        return true;
    } catch (error) {
        dependencies.store.setEntryError(entry.videoId, getErrorMessage(error));
        throw error;
    }
}

export function createPlaylistSyncRunner(dependencies: PlaylistSyncDependencies) {
    let running: Promise<YouTubeSyncResult> | null = null;

    async function execute(): Promise<YouTubeSyncResult> {
        const integration = dependencies.store.getIntegration();
        if (!integration?.encryptedRefreshToken) {
            throw new PlaylistSyncConfigurationError("No YouTube account is connected");
        }
        if (!integration.playlistId) {
            throw new PlaylistSyncConfigurationError("No Fresh Music playlist is configured");
        }

        const startedAt = dependencies.now();
        dependencies.store.startSync(startedAt);
        let added = 0;
        let removed = 0;
        let discovered = 0;
        let adopted = 0;
        let skippedWatched = 0;
        let skippedFiltered = 0;
        let skippedExisting = 0;
        let accessToken: string | null = null;

        try {
            accessToken = await dependencies.getAccessToken();
            const settings = dependencies.store.getSettings();
            const channels = dependencies.store.listChannels();
            const videos = await dependencies.youtube.discoverVideos(
                accessToken,
                channels,
                settings.videoLookbackDays,
                settings
            );
            discovered = videos.length;
            dependencies.onProgress?.("reading_playlist");
            const remoteItems = await dependencies.youtube.listPlaylistItems(
                accessToken,
                integration.playlistId
            );

            const entries = dependencies.store.listEntries();
            const reconciledVideoIds = new Set<string>();
            dependencies.onProgress?.("reading_playlist", { remoteItems: remoteItems.length });

            let removalsRemaining = settings.maxPlaylistRemovalsPerSync;
            dependencies.onProgress?.("removing");

            const filterCandidates = entries.filter((entry) =>
                entry.managedByApp && (entry.state === "active" || entry.state === "adding")
            );
            const ignoredVideos = await dependencies.youtube.findIgnoredVideos(
                accessToken,
                filterCandidates.map((entry) => entry.videoId),
                settings
            );
            const ignoredReasons = new Map(
                ignoredVideos.map((video) => [video.videoId, video.reason])
            );
            for (const entry of filterCandidates.filter((candidate) =>
                ignoredReasons.has(candidate.videoId)
            )) {
                dependencies.onVideoChange?.(
                    "filtered",
                    entry.videoId,
                    ignoredReasons.get(entry.videoId)
                );
                skippedFiltered += 1;
                if (entry.state === "adding") {
                    const remote = remoteItems.find((item) => item.videoId === entry.videoId);
                    if (!remote) {
                        dependencies.store.markEntryRemoved(entry.videoId, "filtered");
                    } else if (removalsRemaining > 0) {
                        if (await deletePendingEntry(dependencies, accessToken, remoteItems, entry, "filtered")) {
                            removed += 1;
                            removalsRemaining -= 1;
                        }
                    } else {
                        continue;
                    }
                } else if (
                    removalsRemaining > 0
                    && await deletePendingEntry(dependencies, accessToken, remoteItems, entry, "filtered")
                ) {
                    removed += 1;
                    removalsRemaining -= 1;
                }
                reconciledVideoIds.add(entry.videoId);
            }

            for (const entry of entries.filter((candidate) => candidate.state === "removal_pending")) {
                if (removalsRemaining <= 0) break;
                if (await deletePendingEntry(dependencies, accessToken, remoteItems, entry)) removed += 1;
                removalsRemaining -= 1;
                reconciledVideoIds.add(entry.videoId);
            }

            const initiallyWatched = new Set(dependencies.store.listWatched());
            for (const entry of entries.filter((candidate) =>
                candidate.state === "active"
                && candidate.managedByApp
                && initiallyWatched.has(candidate.videoId)
            )) {
                if (removalsRemaining <= 0) break;
                if (reconciledVideoIds.has(entry.videoId)) continue;
                if (await deletePendingEntry(dependencies, accessToken, remoteItems, entry)) {
                    removed += 1;
                    removalsRemaining -= 1;
                }
                reconciledVideoIds.add(entry.videoId);
            }

            for (const entry of entries.filter((candidate) =>
                candidate.state === "active" && candidate.managedByApp
            )) {
                if (reconciledVideoIds.has(entry.videoId)) continue;
                const remote = findRemoteItem(remoteItems, entry);
                if (!remote) {
                    dependencies.store.markWatched(entry.videoId);
                    dependencies.store.markEntryRemoved(entry.videoId, "external");
                    dependencies.onVideoChange?.("removed", entry.videoId);
                    removed += 1;
                } else if (remote.id !== entry.playlistItemId) {
                    dependencies.store.activateEntry({
                        videoId: entry.videoId,
                        playlistItemId: remote.id,
                        managedByApp: entry.managedByApp,
                        sourceChannelId: entry.sourceChannelId,
                        publishedAt: entry.publishedAt,
                    });
                }
            }

            const watchedBeforeAdds = new Set(dependencies.store.listWatched());
            for (const entry of entries.filter((candidate) => candidate.state === "adding")) {
                if (reconciledVideoIds.has(entry.videoId)) continue;
                if (watchedBeforeAdds.has(entry.videoId)) {
                    skippedWatched += 1;
                    const remote = remoteItems.find((item) => item.videoId === entry.videoId);
                    if (!remote) {
                        dependencies.store.markEntryRemoved(entry.videoId, "watched");
                        reconciledVideoIds.add(entry.videoId);
                    } else if (removalsRemaining > 0) {
                        if (await deletePendingEntry(dependencies, accessToken, remoteItems, entry)) {
                            removed += 1;
                            removalsRemaining -= 1;
                        }
                        reconciledVideoIds.add(entry.videoId);
                    }
                    continue;
                }
                const remote = remoteItems.find((item) => item.videoId === entry.videoId);
                if (remote) {
                    dependencies.store.activateEntry({
                        videoId: entry.videoId,
                        playlistItemId: remote.id,
                        managedByApp: entry.managedByApp,
                        sourceChannelId: entry.sourceChannelId,
                        publishedAt: entry.publishedAt,
                    });
                    adopted += 1;
                    reconciledVideoIds.add(entry.videoId);
                }
            }

            dependencies.onProgress?.("adding", {
                pendingRemovals: entries.filter((entry) => entry.state === "removal_pending").length,
                removed,
            });

            const watched = new Set(dependencies.store.listWatched());
            const latestEntries = new Map(
                dependencies.store.listEntries().map((entry) => [entry.videoId, entry])
            );
            for (const video of videos) {
                if (watched.has(video.id) || dependencies.store.listWatched().includes(video.id)) {
                    skippedWatched += 1;
                    continue;
                }

                const existing = latestEntries.get(video.id);
                if (existing?.state === "active" || existing?.state === "removal_pending") {
                    skippedExisting += 1;
                    continue;
                }
                const remote = remoteItems.find((item) => item.videoId === video.id);
                if (remote) {
                    dependencies.store.activateEntry({
                        videoId: video.id,
                        playlistItemId: remote.id,
                        managedByApp: false,
                        sourceChannelId: video.sourceChannelId,
                        publishedAt: video.publishedAt,
                    });
                    adopted += 1;
                    continue;
                }

                if (added >= settings.maxPlaylistAddsPerSync) continue;

                if (!existing || existing.state !== "adding") {
                    dependencies.store.prepareEntry({
                        videoId: video.id,
                        sourceChannelId: video.sourceChannelId,
                        publishedAt: video.publishedAt,
                        managedByApp: true,
                    });
                }
                const prepared: YouTubePlaylistEntry = existing?.state === "adding"
                    ? existing
                    : {
                        videoId: video.id,
                        sourceChannelId: video.sourceChannelId,
                        publishedAt: video.publishedAt,
                        playlistItemId: null,
                        state: "adding" as PlaylistEntryState,
                        managedByApp: true,
                        removalReason: null,
                        lastError: null,
                    };
                if (await insertPreparedEntry(
                    dependencies,
                    accessToken,
                    integration.playlistId,
                    remoteItems,
                    prepared
                )) added += 1;
                dependencies.onProgress?.("adding", {
                    added,
                    adopted,
                    skippedWatched,
                    skippedFiltered,
                    skippedExisting,
                });
            }

            const completedAt = dependencies.now();
            dependencies.store.finishSync({
                completedAt,
                nextSyncAt: completedAt + dependencies.intervalMs,
                status: "success",
                added,
                removed,
                error: null,
            });
            return { added, removed, discovered };
        } catch (error) {
            const classified = await classifySyncError(
                dependencies,
                error,
                accessToken,
                integration.playlistId
            );
            const completedAt = dependencies.now();
            dependencies.store.finishSync({
                completedAt,
                nextSyncAt: classified.status === "reauthorization_required"
                    || classified.status === "playlist_missing"
                    ? null
                    : completedAt + dependencies.intervalMs,
                status: classified.status,
                added,
                removed,
                error: classified.error,
            });
            if (!classified.shouldThrow) return { added, removed, discovered };
            throw error;
        }
    }

    return function run(): Promise<YouTubeSyncResult> {
        if (running) return running;
        running = execute().finally(() => {
            running = null;
        });
        return running;
    };
}
