"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    BarChart3,
    Loader2,
    RefreshCw,
} from "lucide-react";
import AppNavbar from "./AppNavbar";
import {
    fetchChannelStatistics,
    syncYouTubeRatings,
} from "@/lib/storage-client";
import type {
    ChannelStatistic,
    ChannelStatisticsResponse,
} from "@/types/channel-statistics";

type SortKey = "name" | "watchedCount" | "likedCount" | "likePercentage";
type SortDirection = "asc" | "desc";

function sortChannels(
    channels: ChannelStatistic[],
    sortKey: SortKey,
    direction: SortDirection
): ChannelStatistic[] {
    const multiplier = direction === "asc" ? 1 : -1;
    return [...channels].sort((left, right) => {
        let comparison: number;
        if (sortKey === "name") {
            comparison = left.name.localeCompare(right.name, "fr", { sensitivity: "base" });
        } else if (sortKey === "likePercentage") {
            if (left.likePercentage == null && right.likePercentage != null) return 1;
            if (left.likePercentage != null && right.likePercentage == null) return -1;
            comparison = (left.likePercentage ?? 0) - (right.likePercentage ?? 0);
        } else {
            comparison = left[sortKey] - right[sortKey];
        }
        if (comparison !== 0) return comparison * multiplier;
        if (sortKey === "likePercentage" && left.watchedCount !== right.watchedCount) {
            return right.watchedCount - left.watchedCount;
        }
        return left.name.localeCompare(right.name, "fr", { sensitivity: "base" });
    });
}

function formatLastSync(value: string | null): string {
    if (!value) return "jamais";
    return new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}

function ratingIsComplete(channel: ChannelStatistic): boolean {
    return channel.ratingCoverageCount === channel.watchedCount;
}

export default function StatisticsPage() {
    const [statistics, setStatistics] = useState<ChannelStatisticsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<SortKey>("likePercentage");
    const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
    const autoSyncStarted = useRef(false);

    const loadStatistics = useCallback(async () => {
        const result = await fetchChannelStatistics();
        setStatistics(result);
        return result;
    }, []);

    const refreshRatings = useCallback(async (force: boolean) => {
        setSyncing(true);
        setError(null);
        try {
            await syncYouTubeRatings(force);
            await loadStatistics();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Impossible d’actualiser les likes YouTube.");
        } finally {
            setSyncing(false);
        }
    }, [loadStatistics]);

    useEffect(() => {
        void loadStatistics().then((result) => {
            if (
                !autoSyncStarted.current
                && result.ratings.connected
                && (result.ratings.stale || result.ratings.hasUncheckedWatchedVideos)
            ) {
                autoSyncStarted.current = true;
                void refreshRatings(false);
            }
        }).catch((cause) => {
            setError(cause instanceof Error ? cause.message : "Impossible de charger les statistiques.");
        }).finally(() => setLoading(false));
    }, [loadStatistics, refreshRatings]);

    const sortedChannels = useMemo(() => sortChannels(
        statistics?.channels ?? [],
        sortKey,
        sortDirection
    ), [statistics, sortDirection, sortKey]);

    const changeSort = (nextKey: SortKey) => {
        if (nextKey === sortKey) {
            setSortDirection((current) => current === "asc" ? "desc" : "asc");
            return;
        }
        setSortKey(nextKey);
        setSortDirection(nextKey === "name" || nextKey === "likePercentage" ? "asc" : "desc");
    };

    const renderSortLabel = (label: string, key: SortKey) => {
        const active = sortKey === key;
        const Icon = sortDirection === "asc" ? ArrowUp : ArrowDown;
        return (
            <button
                type="button"
                onClick={() => changeSort(key)}
                className="inline-flex items-center gap-1 font-medium text-zinc-400 transition hover:text-white"
            >
                {label}
                {active && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
        );
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            <AppNavbar activeSection="statistics" />
            <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 md:py-10">
                <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400">Bibliothèque</p>
                        <h1 className="text-3xl font-bold tracking-tight text-white">Statistiques par chaîne</h1>
                        <p className="max-w-2xl text-sm leading-relaxed text-zinc-500">
                            Compare les musiques vues et likées pour toutes les chaînes présentes dans ton historique.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void refreshRatings(true)}
                        disabled={syncing || !statistics?.ratings.connected}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                        {syncing ? "Actualisation…" : "Actualiser les likes"}
                    </button>
                </header>

                {error && (
                    <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-200">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {statistics && !statistics.ratings.connected && (
                    <div className="mt-6 flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">
                        <BarChart3 className="mt-0.5 h-5 w-5 shrink-0" />
                        <p>
                            Les dernières données connues restent visibles. Pour synchroniser les likes,
                            {" "}<Link href="/settings" className="text-zinc-200 underline underline-offset-4 hover:text-white">connecte ton compte YouTube</Link>.
                        </p>
                    </div>
                )}

                {statistics && (
                    <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-zinc-500">
                        <span>{statistics.channels.length} chaînes</span>
                        <span>Dernière synchronisation des likes : {formatLastSync(statistics.ratings.lastFullSyncAt)}</span>
                        {statistics.pendingIdentificationCount > 0 && (
                            <span>{statistics.pendingIdentificationCount} vues en attente d’identification</span>
                        )}
                        {statistics.unidentifiedWatchedCount > 0 && (
                            <span>{statistics.unidentifiedWatchedCount} vues sans chaîne identifiable</span>
                        )}
                    </div>
                )}

                {loading ? (
                    <div className="flex min-h-[45vh] items-center justify-center text-zinc-500">
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement des statistiques…
                    </div>
                ) : sortedChannels.length > 0 ? (
                    <div className="mt-5 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40">
                        <table className="w-full min-w-[620px] border-collapse text-left text-sm">
                            <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase tracking-wider">
                                <tr>
                                    <th scope="col" className="px-4 py-3" aria-sort={sortKey === "name" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}>
                                        {renderSortLabel("Chaîne", "name")}
                                    </th>
                                    <th scope="col" className="px-4 py-3 text-right" aria-sort={sortKey === "watchedCount" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}>
                                        {renderSortLabel("Vues", "watchedCount")}
                                    </th>
                                    <th scope="col" className="px-4 py-3 text-right" aria-sort={sortKey === "likedCount" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}>
                                        {renderSortLabel("Likées", "likedCount")}
                                    </th>
                                    <th scope="col" className="px-4 py-3 text-right" aria-sort={sortKey === "likePercentage" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}>
                                        {renderSortLabel("% liké", "likePercentage")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/80">
                                {sortedChannels.map((channel) => {
                                    const ratingsComplete = ratingIsComplete(channel);
                                    return (
                                        <tr key={channel.channelId} className="transition-colors hover:bg-zinc-900/80">
                                            <th scope="row" className="px-4 py-4 font-normal">
                                                <div className="flex min-w-0 items-center gap-3">
                                                    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800 text-sm font-bold text-zinc-300">
                                                        {channel.thumbnail ? (
                                                            <Image
                                                                src={channel.thumbnail}
                                                                alt=""
                                                                fill
                                                                sizes="36px"
                                                                className="object-cover"
                                                            />
                                                        ) : channel.name.charAt(0).toLocaleUpperCase()}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <p className="truncate font-medium text-white">{channel.name}</p>
                                                        <span className={`text-[11px] ${channel.followed ? "text-emerald-400" : "text-zinc-600"}`}>
                                                            {channel.followed ? "Suivie" : "Ancienne"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </th>
                                            <td className="px-4 py-4 text-right tabular-nums text-zinc-300">{channel.watchedCount}</td>
                                            <td className="px-4 py-4 text-right tabular-nums text-zinc-300">
                                                {ratingsComplete ? channel.likedCount : <span className="text-zinc-600">À synchroniser</span>}
                                            </td>
                                            <td className="px-4 py-4 text-right tabular-nums">
                                                {channel.likePercentage == null
                                                    ? <span className="text-zinc-600">—</span>
                                                    : <span className={channel.likePercentage < 25 ? "text-amber-400" : "text-zinc-200"}>{channel.likePercentage}%</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="mt-8 flex min-h-[35vh] flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 p-8 text-center">
                        <BarChart3 className="h-8 w-8 text-zinc-700" />
                        <h2 className="mt-3 font-semibold text-white">Pas encore de statistiques</h2>
                        <p className="mt-1 max-w-sm text-sm text-zinc-500">Ajoute une chaîne pour commencer à construire ton historique.</p>
                    </div>
                )}
            </main>
        </div>
    );
}
