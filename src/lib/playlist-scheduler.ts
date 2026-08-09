import "server-only";

import { getSettings } from "./repository";
import { isApplicationInitialized } from "./catalog-repository";
import { getLatestSyncRun, interruptStaleSyncRuns } from "./sync-run-repository";
import { requestYouTubeSync } from "./youtube-sync-manager";
import { getYouTubeQuotaStatus } from "./youtube-quota";

declare global {
    // eslint-disable-next-line no-var
    var __freshMusicPlaylistSchedulerStarted: boolean | undefined;
    // eslint-disable-next-line no-var
    var __freshMusicPlaylistSchedulerTimer: NodeJS.Timeout | undefined;
}

function scheduledSync(): void {
    requestYouTubeSync("scheduled", false);
}

export function reschedulePlaylistScheduler(): void {
    if (globalThis.__freshMusicPlaylistSchedulerTimer) {
        clearTimeout(globalThis.__freshMusicPlaylistSchedulerTimer);
        globalThis.__freshMusicPlaylistSchedulerTimer = undefined;
    }
    const settings = getSettings();
    if (!settings.automaticSyncEnabled || !isApplicationInitialized()) return;

    const latest = getLatestSyncRun();
    const lastCompleted = latest?.completedAt ?? 0;
    const quota = getYouTubeQuotaStatus();
    const intervalDueAt = lastCompleted > 0
        ? lastCompleted + settings.syncIntervalMinutes * 60 * 1000
        : Date.now() + 2_000;
    const dueAt = quota.pausedUntil
        ? Math.max(intervalDueAt, new Date(quota.pausedUntil).getTime())
        : intervalDueAt;
    const delay = Math.max(250, dueAt - Date.now());
    globalThis.__freshMusicPlaylistSchedulerTimer = setTimeout(scheduledSync, delay);
    globalThis.__freshMusicPlaylistSchedulerTimer.unref();
}

export function startPlaylistScheduler(): void {
    if (globalThis.__freshMusicPlaylistSchedulerStarted) return;
    globalThis.__freshMusicPlaylistSchedulerStarted = true;
    interruptStaleSyncRuns();
    reschedulePlaylistScheduler();
}
