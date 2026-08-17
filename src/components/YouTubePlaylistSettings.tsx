"use client";

import { useCallback, useEffect, useState } from "react";
import {
    AlertTriangle,
    ChevronDown,
    ExternalLink,
    Link2,
    Link2Off,
    Loader2,
    RefreshCw,
    Youtube,
} from "lucide-react";
import {
    disconnectYouTube,
    fetchYouTubeIntegration,
    recreateYouTubePlaylist,
    syncYouTubePlaylist,
} from "@/lib/storage-client";
import {
    YouTubeIntegrationPublicStatus,
    type YouTubeSyncVideo,
} from "@/types/youtube-integration";
import SettingHelpTooltip from "./SettingHelpTooltip";
import type { AppSettings } from "@/types/settings";
import YouTubeErrorMessage from "./YouTubeErrorMessage";

type Action = "sync" | "recreate" | "disconnect" | null;

function SyncVideoList({
    title,
    emptyLabel,
    videos,
    showFilterReason = false,
}: {
    title: string;
    emptyLabel: string;
    videos: YouTubeSyncVideo[];
    showFilterReason?: boolean;
}) {
    return (
        <section className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/30">
            <h4 className="border-b border-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-300">
                {title}
            </h4>
            {videos.length === 0 ? (
                <p className="px-3 py-4 text-xs text-zinc-600">{emptyLabel}</p>
            ) : (
                <ul className="max-h-64 divide-y divide-zinc-800/80 overflow-y-auto">
                    {videos.map((video) => (
                        <li key={video.id}>
                            <a
                                href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-start justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-zinc-800/40"
                            >
                                <span className="min-w-0">
                                    <span className="block truncate text-xs font-medium text-zinc-200">
                                        {video.title}
                                    </span>
                                    {video.channelTitle && (
                                        <span className="mt-0.5 block truncate text-[11px] text-zinc-600">
                                            {video.channelTitle}
                                        </span>
                                    )}
                                    {showFilterReason && video.filterReason && (
                                        <span className="mt-1 block text-[11px] leading-snug text-amber-500/80">
                                            {video.filterReason}
                                        </span>
                                    )}
                                </span>
                                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" />
                            </a>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function formatDate(value: string | null): string {
    if (!value) return "—";
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}

function statusLabel(status: YouTubeIntegrationPublicStatus["sync"]["status"]): string {
    switch (status) {
        case "running": return "Syncing";
        case "success": return "Up to date";
        case "reauthorization_required": return "Reconnect required";
        case "playlist_missing": return "Playlist missing";
        case "error": return "Sync error";
        case "disconnected": return "Disconnected";
        default: return "Ready";
    }
}

function phaseLabel(phase: NonNullable<YouTubeIntegrationPublicStatus["progress"]>["phase"]): string {
    return phase.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

interface YouTubePlaylistSettingsProps {
    onWatchedReconciled: () => void | Promise<void>;
    settings: AppSettings;
}

export default function YouTubePlaylistSettings({ onWatchedReconciled, settings }: YouTubePlaylistSettingsProps) {
    const [status, setStatus] = useState<YouTubeIntegrationPublicStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [action, setAction] = useState<Action>(null);
    const [error, setError] = useState<string | null>(null);
    const [showDetails, setShowDetails] = useState(false);

    const refresh = useCallback(async () => {
        try {
            setStatus(await fetchYouTubeIntegration());
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not load YouTube integration");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
        const params = new URLSearchParams(window.location.search);
        if (params.get("youtube") === "error") {
            setError(params.get("message") || "Google authorization failed");
        }
        if (params.has("youtube")) {
            window.history.replaceState({}, "", window.location.pathname);
        }
    }, [refresh]);

    useEffect(() => {
        if (!status?.connected) return;
        const delay = status.progress?.status === "running" ? 2_000 : 30_000;
        const timer = window.setTimeout(refresh, delay);
        return () => window.clearTimeout(timer);
    }, [refresh, status]);

    const runAction = async (
        name: Exclude<Action, null>,
        operation: () => Promise<YouTubeIntegrationPublicStatus>
    ) => {
        setAction(name);
        setError(null);
        try {
            setStatus(await operation());
            if (name === "sync" || name === "recreate") await onWatchedReconciled();
        } catch (err) {
            setError(err instanceof Error ? err.message : "YouTube operation failed");
            await refresh();
        } finally {
            setAction(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-800/30 p-4 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading YouTube connection…
            </div>
        );
    }

    if (!status?.configured) {
        return (
            <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                    <div className="space-y-1">
                        <p className="text-sm font-medium text-amber-200">Google OAuth is not configured</p>
                        <p className="text-xs leading-relaxed text-amber-200/60">
                            Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_TOKEN_ENCRYPTION_KEY,
                            and APP_BASE_URL on the server to enable the automatic playlist.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (!status.connected) {
        return (
            <div className="rounded-xl border border-zinc-800 bg-zinc-800/30 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <p className="text-sm font-medium text-white">Connect your YouTube account</p>
                        <p className="max-w-md text-xs leading-relaxed text-zinc-500">
                            Fresh Music will create a private playlist and add new unwatched releases every hour.
                        </p>
                    </div>
                    <a
                        href="/api/youtube/auth/start"
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500"
                    >
                        <Youtube className="h-4 w-4" />
                        Connect YouTube
                    </a>
                </div>
                {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
            </div>
        );
    }

    const needsAttention = status.sync.status === "error"
        || status.sync.status === "reauthorization_required"
        || status.sync.status === "playlist_missing"
        || status.progress?.status === "failed"
        || status.progress?.status === "paused";
    const progress = status.progress;
    const running = progress?.status === "running";
    const quotaTotalPercent = Math.min(100, status.quota.totalLimit > 0
        ? status.quota.estimatedTotalUnits / status.quota.totalLimit * 100
        : 0);
    const quotaWritePercent = Math.min(100, status.quota.writeLimit > 0
        ? status.quota.writeUnits / status.quota.writeLimit * 100
        : 0);

    return (
        <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-800/30 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                    <div className="rounded-lg bg-red-600/15 p-2 text-red-400">
                        <Youtube className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">
                            {status.account?.title ?? "Connected YouTube account"}
                        </p>
                        <p className={`mt-0.5 text-xs ${needsAttention ? "text-amber-400" : "text-emerald-400"}`}>
                            {running
                                ? phaseLabel(progress.phase)
                                : progress?.status === "paused"
                                    ? "Sync paused"
                                    : progress?.status === "failed"
                                        ? "Sync failed"
                                        : statusLabel(status.sync.status)}
                        </p>
                    </div>
                </div>
                {status.sync.status === "reauthorization_required" && (
                    <a
                        href="/api/youtube/auth/start"
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-700 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-600"
                    >
                        <Link2 className="h-3.5 w-3.5" /> Reconnect
                    </a>
                )}
            </div>

            {status.playlist ? (
                <div className="flex flex-wrap gap-2">
                    <a
                        href={status.playlist.youtubeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:border-zinc-600 hover:text-white"
                    >
                        YouTube <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <a
                        href={status.playlist.youtubeMusicUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:border-zinc-600 hover:text-white"
                    >
                        YouTube Music <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                </div>
            ) : null}

            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-zinc-950/30 p-3 text-xs sm:grid-cols-4">
                <div>
                    <dt className="flex items-center gap-1 text-zinc-600">Last successful sync
                        <SettingHelpTooltip label="Last successful sync">Last completed playlist reconciliation, distinct from catalogue discovery.</SettingHelpTooltip>
                    </dt>
                    <dd className="mt-1 text-zinc-300">{formatDate(status.sync.lastSuccessfulAt)}</dd>
                </div>
                <div>
                    <dt className="text-zinc-600">Last attempt</dt>
                    <dd className="mt-1 text-zinc-300">{formatDate(progress?.startedAt ?? status.sync.lastStartedAt)}</dd>
                </div>
                <div>
                    <dt className="text-zinc-600">Next sync</dt>
                    <dd className="mt-1 text-zinc-300">{formatDate(status.sync.nextSyncAt)}</dd>
                </div>
                <div>
                    <dt className="text-zinc-600">Last added / removed</dt>
                    <dd className="mt-1 text-zinc-300">{progress?.added ?? status.sync.added} / {progress?.removed ?? status.sync.removed}</dd>
                </div>
                <div>
                    <dt className="flex items-center gap-1 text-zinc-600">Pending additions
                        <SettingHelpTooltip label="Pending additions">Eligible tracks waiting for a future run because of per-sync or quota limits.</SettingHelpTooltip>
                    </dt>
                    <dd className="mt-1 text-zinc-300">{progress?.pendingAdds ?? 0}</dd>
                </div>
                <div>
                    <dt className="flex items-center gap-1 text-zinc-600">Pending removals
                        <SettingHelpTooltip label="Pending removals">Watched or filtered tracks retained locally and retried automatically.</SettingHelpTooltip>
                    </dt>
                    <dd className="mt-1 text-zinc-300">{progress?.pendingRemovals ?? 0}</dd>
                </div>
            </dl>
            <p className="flex items-center gap-1 text-xs text-zinc-600">
                Catalogue last updated {formatDate(status.catalog.lastDiscoveryAt)}
                <SettingHelpTooltip label="Catalogue last updated">Discovery updates the local catalogue; playlist synchronization then reconciles that stored catalogue with YouTube.</SettingHelpTooltip>
            </p>

            {status.quota.pausedUntil && (
                <p className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-xs text-amber-300">
                    YouTube calls are paused until {formatDate(status.quota.pausedUntil)}.
                </p>
            )}
            {!status.quota.pausedUntil && progress?.status === "paused" && status.quota.remainingMutations === 0 && (
                <p className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-xs text-amber-300">
                    Playlist writes are suspended until the budget resets on {formatDate(status.quota.resetAt)},
                    or until you increase the configured budget.
                </p>
            )}

            {(quotaTotalPercent >= 80 || quotaWritePercent >= 80) && (
                <p className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-xs text-amber-300">
                    At least 80% of a configured daily quota limit has been used.
                </p>
            )}

            <div className="space-y-3 rounded-lg bg-zinc-950/30 p-3 text-xs">
                <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1 text-zinc-500">Estimated total usage
                        <SettingHelpTooltip label="Estimated total usage">Fresh Music counts its own requests. The Google Cloud console remains authoritative if the project is shared.</SettingHelpTooltip>
                    </span>
                    <span className="text-zinc-300">{status.quota.estimatedTotalUnits} / {status.quota.totalLimit}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div className={`h-full ${quotaTotalPercent >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${quotaTotalPercent}%` }} />
                </div>
                <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1 text-zinc-500">Write budget
                        <SettingHelpTooltip label="Write budget">Playlist mutations cost 50 units each. This separate limit preserves quota for discovery reads.</SettingHelpTooltip>
                    </span>
                    <span className="text-zinc-300">{status.quota.writeUnits} / {status.quota.writeLimit}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div className={`h-full ${quotaWritePercent >= 80 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${quotaWritePercent}%` }} />
                </div>
                <div className="flex flex-wrap justify-between gap-2 text-zinc-600">
                    <span>{status.quota.remainingMutations} mutations remaining</span>
                    <span>{status.quota.searchCalls} channel searches</span>
                    <span className="flex items-center gap-1">Reset {formatDate(status.quota.resetAt)}
                        <SettingHelpTooltip label="Quota reset">YouTube resets quota at midnight Pacific Time; this timestamp is displayed in your browser&apos;s local time.</SettingHelpTooltip>
                    </span>
                </div>
            </div>

            {running && progress && (
                <div className="space-y-2 rounded-lg border border-blue-900/40 bg-blue-950/20 p-3 text-xs text-blue-200">
                    <div className="flex justify-between"><span>{phaseLabel(progress.phase)}</span><span>{progress.channelsProcessed}/{progress.channelsTotal} channels</span></div>
                    <div className="grid grid-cols-2 gap-2 text-blue-200/70 sm:grid-cols-4">
                        <span>{progress.discovered} discovered</span>
                        <span>{progress.catalogued} catalogued</span>
                        <span>{progress.removed}/{settings.maxPlaylistRemovalsPerSync} removals</span>
                        <span>{progress.added}/{settings.maxPlaylistAddsPerSync} additions</span>
                    </div>
                </div>
            )}

            {progress && (
                <div className="rounded-lg border border-zinc-800">
                    <button type="button" onClick={() => setShowDetails((value) => !value)}
                        className="flex w-full items-center justify-between p-3 text-xs font-medium text-zinc-300 hover:bg-zinc-800/40">
                        Details of the last sync
                        <ChevronDown className={`h-4 w-4 transition-transform ${showDetails ? "rotate-180" : ""}`} />
                    </button>
                    {showDetails && (
                        <div className="border-t border-zinc-800 p-3">
                            {!progress.videoDetailsAvailable ? (
                                <p className="rounded-lg bg-zinc-950/30 px-3 py-4 text-xs text-zinc-500">
                                    Video details were not recorded for this sync.
                                </p>
                            ) : (
                                <div className="grid gap-3 lg:grid-cols-3">
                                    <SyncVideoList
                                        title="Added videos"
                                        emptyLabel="No videos were added."
                                        videos={progress.addedVideos}
                                    />
                                    <SyncVideoList
                                        title="Removed videos"
                                        emptyLabel="No videos were removed."
                                        videos={progress.removedVideos}
                                    />
                                    <SyncVideoList
                                        title="Filtered videos"
                                        emptyLabel="No videos were filtered."
                                        videos={progress.filteredVideos}
                                        showFilterReason
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {(error || status.sync.error || progress?.error) && (
                <p className="rounded-lg border border-red-900/40 bg-red-950/20 p-3 text-xs leading-relaxed text-red-300">
                    <YouTubeErrorMessage message={error || status.sync.error || progress?.error || ""} />
                </p>
            )}

            <p className="text-xs leading-relaxed text-zinc-500">
                YouTube does not expose your watch history. After listening, remove the track from the playlist
                or mark it watched in Fresh Music; the next sync will reconcile both sides.
            </p>

            <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
                <button
                    onClick={() => runAction("sync", syncYouTubePlaylist)}
                    disabled={action !== null || running || status.sync.status === "playlist_missing" || !status.playlist}
                    className="inline-flex items-center gap-2 rounded-lg bg-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {action === "sync" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Sync now
                </button>
                {(status.sync.status === "playlist_missing" || !status.playlist) && (
                    <button
                        onClick={() => runAction("recreate", recreateYouTubePlaylist)}
                        disabled={action !== null}
                        className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
                    >
                        {action === "recreate" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Find or recreate playlist
                    </button>
                )}
                <button
                    onClick={() => {
                        if (window.confirm("Disconnect YouTube? The playlist itself will be kept.")) {
                            runAction("disconnect", disconnectYouTube);
                        }
                    }}
                    disabled={action !== null}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-red-400 disabled:opacity-50"
                >
                    <Link2Off className="h-3.5 w-3.5" />
                    Disconnect
                </button>
            </div>
        </div>
    );
}
