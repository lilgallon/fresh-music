export type YouTubeSyncStatus =
    | "idle"
    | "running"
    | "success"
    | "error"
    | "reauthorization_required"
    | "playlist_missing"
    | "disconnected";

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
    };
}

export interface YouTubeSyncResult {
    added: number;
    removed: number;
    discovered: number;
}
