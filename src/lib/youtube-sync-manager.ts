import "server-only";

import {
    isApplicationInitialized,
    listChannelDiscoveryStates,
    listEligibleUnwatchedCatalogVideos,
} from "./catalog-repository";
import { discoverYouTubeCatalog } from "./youtube-catalog-discovery";
import { getSettings } from "./repository";
import { synchronizeYouTubePlaylist } from "./playlist-sync";
import { getYouTubeIntegration, listYouTubePlaylistEntries } from "./youtube-integration-repository";
import {
    getLatestSyncRun,
    startSyncRun,
    trimSyncRuns,
    updateSyncRun,
    type SyncRunProgress,
} from "./sync-run-repository";
import { getYouTubeQuotaStatus } from "./youtube-quota";
import type { YouTubeSyncTrigger } from "@/types/youtube-integration";

declare global {
    // eslint-disable-next-line no-var
    var __freshMusicSyncPromise: Promise<void> | undefined;
}

function pendingCounts(): { pendingAdds: number; pendingRemovals: number } {
    const entries = listYouTubePlaylistEntries();
    const activeIds = new Set(entries
        .filter((entry) => entry.state === "active" || entry.state === "adding" || entry.state === "removal_pending")
        .map((entry) => entry.videoId));
    return {
        pendingAdds: listEligibleUnwatchedCatalogVideos(getSettings())
            .filter((video) => !activeIds.has(video.id)).length
            + entries.filter((entry) => entry.state === "adding").length,
        pendingRemovals: entries.filter((entry) => entry.state === "removal_pending").length,
    };
}

async function execute(runId: number): Promise<void> {
    const quotaBefore = getYouTubeQuotaStatus();
    try {
        updateSyncRun(runId, { phase: "initializing", ...pendingCounts() });
        const discovery = await discoverYouTubeCatalog(runId);
        updateSyncRun(runId, {
            discovered: discovery.discovered,
            catalogued: discovery.catalogued,
            ...pendingCounts(),
        });

        const integration = getYouTubeIntegration();
        let added = 0;
        let removed = 0;
        if (integration?.encryptedRefreshToken && integration.playlistId) {
            const result = await synchronizeYouTubePlaylist((phase, values) => {
                updateSyncRun(runId, { phase, ...(values ?? {}) });
            });
            added = result.added;
            removed = result.removed;
        }

        const quotaAfter = getYouTubeQuotaStatus();
        updateSyncRun(runId, {
            status: "completed",
            phase: "completed",
            completedAt: Date.now(),
            added,
            removed,
            ...pendingCounts(),
            quotaReadUnits: quotaAfter.readUnits - quotaBefore.readUnits,
            quotaWriteUnits: quotaAfter.writeUnits - quotaBefore.writeUnits,
        });
    } catch (error) {
        const quotaAfter = getYouTubeQuotaStatus();
        const message = error instanceof Error ? error.message : "Unknown synchronization error";
        const paused = quotaAfter.pausedUntil != null
            || (error instanceof Error && error.name === "YouTubeWriteBudgetError")
            || message.toLocaleLowerCase().includes("quota is exhausted");
        updateSyncRun(runId, {
            status: paused ? "paused" : "failed",
            phase: paused ? "paused" : "failed",
            completedAt: Date.now(),
            error: message,
            ...pendingCounts(),
            quotaReadUnits: quotaAfter.readUnits - quotaBefore.readUnits,
            quotaWriteUnits: quotaAfter.writeUnits - quotaBefore.writeUnits,
        });
        console.error("Fresh Music synchronization failed:", error);
    } finally {
        trimSyncRuns();
        globalThis.__freshMusicSyncPromise = undefined;
        const { reschedulePlaylistScheduler } = await import("./playlist-scheduler");
        reschedulePlaylistScheduler();
    }
}

export function requestYouTubeSync(
    trigger: YouTubeSyncTrigger,
    forceManual: boolean
): { started: boolean; run: SyncRunProgress | null } {
    if (globalThis.__freshMusicSyncPromise) {
        return { started: false, run: getLatestSyncRun() };
    }
    if (!isApplicationInitialized()) return { started: false, run: getLatestSyncRun() };
    if (!forceManual && !getSettings().automaticSyncEnabled) {
        return { started: false, run: getLatestSyncRun() };
    }

    const quota = getYouTubeQuotaStatus();
    if (quota.pausedUntil) {
        const runId = startSyncRun(trigger, listChannelDiscoveryStates().length);
        updateSyncRun(runId, {
            status: "paused",
            phase: "paused",
            completedAt: Date.now(),
            error: `YouTube quota is paused until ${quota.pausedUntil}.`,
        });
        trimSyncRuns();
        void import("./playlist-scheduler").then(({ reschedulePlaylistScheduler }) => {
            reschedulePlaylistScheduler();
        });
        return { started: false, run: getLatestSyncRun() };
    }

    const runId = startSyncRun(trigger, listChannelDiscoveryStates().length);
    globalThis.__freshMusicSyncPromise = execute(runId);
    return { started: true, run: getLatestSyncRun() };
}
