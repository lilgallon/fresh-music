"use client";

import { useCallback, useEffect, useState } from "react";
import {
    AlertTriangle,
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
import { YouTubeIntegrationPublicStatus } from "@/types/youtube-integration";

type Action = "sync" | "recreate" | "disconnect" | null;

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

interface YouTubePlaylistSettingsProps {
    onWatchedReconciled: () => void | Promise<void>;
}

export default function YouTubePlaylistSettings({ onWatchedReconciled }: YouTubePlaylistSettingsProps) {
    const [status, setStatus] = useState<YouTubeIntegrationPublicStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [action, setAction] = useState<Action>(null);
    const [error, setError] = useState<string | null>(null);

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
        || status.sync.status === "playlist_missing";

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
                            {statusLabel(status.sync.status)}
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
                    <dt className="text-zinc-600">Last sync</dt>
                    <dd className="mt-1 text-zinc-300">{formatDate(status.sync.lastCompletedAt)}</dd>
                </div>
                <div>
                    <dt className="text-zinc-600">Next sync</dt>
                    <dd className="mt-1 text-zinc-300">{formatDate(status.sync.nextSyncAt)}</dd>
                </div>
                <div>
                    <dt className="text-zinc-600">Added</dt>
                    <dd className="mt-1 text-zinc-300">{status.sync.added}</dd>
                </div>
                <div>
                    <dt className="text-zinc-600">Removed</dt>
                    <dd className="mt-1 text-zinc-300">{status.sync.removed}</dd>
                </div>
            </dl>

            {(error || status.sync.error) && (
                <p className="rounded-lg border border-red-900/40 bg-red-950/20 p-3 text-xs leading-relaxed text-red-300">
                    {error || status.sync.error}
                </p>
            )}

            <p className="text-xs leading-relaxed text-zinc-500">
                YouTube does not expose your watch history. After listening, remove the track from the playlist
                or mark it watched in Fresh Music; the next sync will reconcile both sides.
            </p>

            <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
                <button
                    onClick={() => runAction("sync", syncYouTubePlaylist)}
                    disabled={action !== null || status.sync.status === "playlist_missing"}
                    className="inline-flex items-center gap-2 rounded-lg bg-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {action === "sync" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Sync now
                </button>
                {status.sync.status === "playlist_missing" && (
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
