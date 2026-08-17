import "server-only";

import { getDb } from "./db";
import type {
    YouTubeSyncPhase,
    YouTubeSyncTrigger,
    YouTubeSyncVideo,
} from "@/types/youtube-integration";

export type SyncRunVideoAction = "added" | "removed" | "filtered";

export interface SyncRunProgress {
    id: number;
    trigger: YouTubeSyncTrigger;
    status: "running" | "completed" | "paused" | "failed";
    phase: YouTubeSyncPhase;
    startedAt: number;
    completedAt: number | null;
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
    videoDetailsAvailable: boolean;
    addedVideos: YouTubeSyncVideo[];
    removedVideos: YouTubeSyncVideo[];
    filteredVideos: YouTubeSyncVideo[];
    error: string | null;
}

interface SyncRunRow {
    id: number;
    trigger: YouTubeSyncTrigger;
    status: SyncRunProgress["status"];
    phase: YouTubeSyncPhase;
    started_at: number;
    completed_at: number | null;
    channels_total: number;
    channels_processed: number;
    discovered: number;
    catalogued: number;
    remote_items: number;
    pending_adds: number;
    pending_removals: number;
    added: number;
    removed: number;
    adopted: number;
    skipped_watched: number;
    skipped_filtered: number;
    skipped_existing: number;
    quota_read_units: number;
    quota_write_units: number;
    video_details_version: number;
    error: string | null;
}

interface SyncRunVideoRow {
    video_id: string;
    action: SyncRunVideoAction;
    title: string | null;
    channel_title: string | null;
    filter_reason: string | null;
}

function listSyncRunVideos(runId: number): Record<SyncRunVideoAction, YouTubeSyncVideo[]> {
    const grouped: Record<SyncRunVideoAction, YouTubeSyncVideo[]> = {
        added: [],
        removed: [],
        filtered: [],
    };
    const rows = getDb().prepare<[number], SyncRunVideoRow>(
        `SELECT run_videos.video_id, run_videos.action, run_videos.filter_reason,
                videos.title, videos.channel_title
         FROM youtube_sync_run_videos AS run_videos
         LEFT JOIN videos ON videos.video_id = run_videos.video_id
         WHERE run_videos.run_id = ?
         ORDER BY run_videos.rowid ASC`
    ).all(runId);
    for (const row of rows) {
        grouped[row.action].push({
            id: row.video_id,
            title: row.title || "Unavailable video",
            channelTitle: row.channel_title ?? "",
            filterReason: row.filter_reason,
        });
    }
    return grouped;
}

function mapRun(row: SyncRunRow): SyncRunProgress {
    const videos = listSyncRunVideos(row.id);
    return {
        id: row.id,
        trigger: row.trigger,
        status: row.status,
        phase: row.phase,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        channelsTotal: row.channels_total,
        channelsProcessed: row.channels_processed,
        discovered: row.discovered,
        catalogued: row.catalogued,
        remoteItems: row.remote_items,
        pendingAdds: row.pending_adds,
        pendingRemovals: row.pending_removals,
        added: row.added,
        removed: row.removed,
        adopted: row.adopted,
        skippedWatched: row.skipped_watched,
        skippedFiltered: row.skipped_filtered,
        skippedExisting: row.skipped_existing,
        quotaReadUnits: row.quota_read_units,
        quotaWriteUnits: row.quota_write_units,
        videoDetailsAvailable: row.video_details_version >= 1,
        addedVideos: videos.added,
        removedVideos: videos.removed,
        filteredVideos: videos.filtered,
        error: row.error,
    };
}

export function startSyncRun(trigger: YouTubeSyncTrigger, channelsTotal: number): number {
    const result = getDb().prepare(
        `INSERT INTO youtube_sync_runs (
            trigger, status, phase, started_at, channels_total, video_details_version
         ) VALUES (?, 'running', 'queued', ?, ?, 1)`
    ).run(trigger, Date.now(), channelsTotal);
    return Number(result.lastInsertRowid);
}

export function recordSyncRunVideos(
    runId: number,
    action: SyncRunVideoAction,
    videos: readonly (string | { videoId: string; filterReason?: string })[]
): void {
    const statement = getDb().prepare(
        `INSERT INTO youtube_sync_run_videos (run_id, video_id, action, filter_reason)
         VALUES (@runId, @videoId, @action, @filterReason)
         ON CONFLICT(run_id, action, video_id) DO UPDATE SET
            filter_reason = COALESCE(excluded.filter_reason, filter_reason)`
    );
    getDb().transaction(() => {
        for (const video of videos) {
            statement.run({
                runId,
                action,
                videoId: typeof video === "string" ? video : video.videoId,
                filterReason: typeof video === "string" ? null : video.filterReason ?? null,
            });
        }
    })();
}

export function updateSyncRun(id: number, values: Partial<Omit<SyncRunProgress, "id" | "trigger" | "startedAt">>): void {
    const mapping: Record<string, string> = {
        status: "status", phase: "phase", completedAt: "completed_at",
        channelsTotal: "channels_total", channelsProcessed: "channels_processed",
        discovered: "discovered", catalogued: "catalogued", remoteItems: "remote_items",
        pendingAdds: "pending_adds", pendingRemovals: "pending_removals",
        added: "added", removed: "removed", adopted: "adopted",
        skippedWatched: "skipped_watched", skippedFiltered: "skipped_filtered",
        skippedExisting: "skipped_existing", quotaReadUnits: "quota_read_units",
        quotaWriteUnits: "quota_write_units", error: "error",
    };
    const entries = Object.entries(values).filter(([key]) => mapping[key]);
    if (entries.length === 0) return;
    const assignments = entries.map(([key]) => `${mapping[key]} = @${key}`).join(", ");
    getDb().prepare(`UPDATE youtube_sync_runs SET ${assignments} WHERE id = @id`).run({ id, ...values });
}

export function getLatestSyncRun(): SyncRunProgress | null {
    const row = getDb().prepare<[], SyncRunRow>(
        "SELECT * FROM youtube_sync_runs ORDER BY id DESC LIMIT 1"
    ).get();
    return row ? mapRun(row) : null;
}

export function getLastSuccessfulSyncAt(): number | null {
    return getDb().prepare<[], { completed_at: number | null }>(
        `SELECT completed_at FROM youtube_sync_runs
         WHERE status = 'completed' ORDER BY id DESC LIMIT 1`
    ).get()?.completed_at ?? null;
}

export function interruptStaleSyncRuns(): void {
    getDb().prepare(
        `UPDATE youtube_sync_runs
         SET status = 'failed', phase = 'failed', completed_at = ?,
             error = 'Synchronization was interrupted by an application restart.'
         WHERE status = 'running'`
    ).run(Date.now());
}

export function trimSyncRuns(): void {
    getDb().prepare(
        `DELETE FROM youtube_sync_runs
         WHERE id NOT IN (SELECT id FROM youtube_sync_runs ORDER BY id DESC LIMIT 30)`
    ).run();
}
