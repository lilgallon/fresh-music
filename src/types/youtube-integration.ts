export type YouTubeSyncStatus =
    | "idle"
    | "running"
    | "success"
    | "error"
    | "reauthorization_required"
    | "playlist_missing"
    | "disconnected";

export type YouTubeSyncPhase =
    | "queued"
    | "initializing"
    | "discovering"
    | "enriching_history"
    | "reading_playlist"
    | "removing"
    | "adding"
    | "completed"
    | "paused"
    | "failed";

export type YouTubeSyncTrigger = "manual" | "scheduled" | "bootstrap" | "oauth" | "startup";

export interface YouTubeSyncProgress {
    id: number;
    trigger: YouTubeSyncTrigger;
    status: "running" | "completed" | "paused" | "failed";
    phase: YouTubeSyncPhase;
    startedAt: string;
    completedAt: string | null;
    channelsTotal: number;
    channelsProcessed: number;
    discovered: number;
    catalogued: number;
    remoteItems: number;
    pendingAdds: number;
    pendingRemovals: number;
    added: number;
    removed: number;
    adopted: number;
    skippedWatched: number;
    skippedFiltered: number;
    skippedExisting: number;
    quotaReadUnits: number;
    quotaWriteUnits: number;
    error: string | null;
}

export interface YouTubeIntegrationPublicStatus {
    configured: boolean;
    connected: boolean;
    account: {
        channelId: string;
        title: string;
    } | null;
    playlist: {
        id: string;
        title: string;
        youtubeUrl: string;
        youtubeMusicUrl: string;
    } | null;
    sync: {
        status: YouTubeSyncStatus;
        lastStartedAt: string | null;
        lastCompletedAt: string | null;
        nextSyncAt: string | null;
        added: number;
        removed: number;
        error: string | null;
        lastSuccessfulAt: string | null;
    };
    catalog: {
        initialized: boolean;
        lastDiscoveryAt: string | null;
    };
    quota: {
        day: string;
        totalLimit: number;
        writeLimit: number;
        readUnits: number;
        writeUnits: number;
        searchCalls: number;
        estimatedTotalUnits: number;
        remainingMutations: number;
        resetAt: string;
        pausedUntil: string | null;
    };
    progress: YouTubeSyncProgress | null;
}

export interface YouTubeSyncResult {
    added: number;
    removed: number;
    discovered: number;
}
