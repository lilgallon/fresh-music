"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { YouTubeVideo, YouTubeChannel } from "@/types/youtube";
import {
    readChannelsCache,
    readWatchedCache,
    readSettingsCache,
    writeChannelsCache,
    writeWatchedCache,
    writeSettingsCache,
    fetchWatched,
    bootstrapApplicationCache,
    fetchCatalogVideos,
    postWatched,
    deleteWatched,
    DEFAULT_SETTINGS,
    AppSettings,
} from "@/lib/storage-client";
import VideoCard from "./VideoCard";
import VideoModal from "./VideoModal";
import { AlertTriangle, Music, History, PlayCircle, Loader2, Music2, Settings2 } from "lucide-react";
import Link from "next/link";

export default function Dashboard() {
    const [videos, setVideos] = useState<YouTubeVideo[]>([]);
    const [followedChannels, setFollowedChannels] = useState<YouTubeChannel[]>([]);
    const [watchedIds, setWatchedIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [videoLoadError, setVideoLoadError] = useState<string | null>(null);
    const [nextVideoCursor, setNextVideoCursor] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"new" | "history">("new");
    const [selectedVideo, setSelectedVideo] = useState<YouTubeVideo | null>(null);
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const hydratedRef = useRef(false);

    // Initial hydration: localStorage first (instant render), then reconcile with server
    useEffect(() => {
        const cachedChannels = readChannelsCache();
        const cachedWatched = readWatchedCache();
        const cachedSettings = readSettingsCache();
        if (cachedChannels) setFollowedChannels(cachedChannels);
        if (cachedWatched) setWatchedIds(cachedWatched);
        if (cachedSettings) setSettings(cachedSettings);

        (async () => {
            try {
                const hydrated = await bootstrapApplicationCache({
                    channels: cachedChannels,
                    watchedIds: cachedWatched,
                    settings: cachedSettings,
                });
                setFollowedChannels(hydrated.channels);
                setWatchedIds(hydrated.watchedIds);
                setSettings(hydrated.settings);
                writeChannelsCache(hydrated.channels);
                writeWatchedCache(hydrated.watchedIds);
                writeSettingsCache(hydrated.settings);
            } catch (err) {
                console.error("Failed to sync with server, using local cache:", err);
            } finally {
                hydratedRef.current = true;
            }
        })();
    }, []);

    // Mirror state into localStorage cache once we are hydrated
    useEffect(() => {
        if (hydratedRef.current) writeChannelsCache(followedChannels);
    }, [followedChannels]);
    useEffect(() => {
        if (hydratedRef.current) writeWatchedCache(watchedIds);
    }, [watchedIds]);
    useEffect(() => {
        if (hydratedRef.current) writeSettingsCache(settings);
    }, [settings]);

    const refreshWatchedState = useCallback(async () => {
        try {
            const serverWatched = await fetchWatched();
            setWatchedIds(serverWatched);
            writeWatchedCache(serverWatched);
        } catch (error) {
            console.error("Failed to refresh watched state:", error);
        }
    }, []);

    useEffect(() => {
        window.addEventListener("focus", refreshWatchedState);
        return () => window.removeEventListener("focus", refreshWatchedState);
    }, [refreshWatchedState]);

    const loadVideos = useCallback(async (append = false, silent = false) => {
        if (!silent) setLoading(true);
        try {
            const result = await fetchCatalogVideos(activeTab, append ? nextVideoCursor : null);
            setVideos((previous) => append ? [...previous, ...result.videos] : result.videos);
            setNextVideoCursor(result.nextCursor);
            setVideoLoadError(null);
        } catch (error) {
            setVideoLoadError(error instanceof Error ? error.message : "Could not load the local catalogue.");
        } finally {
            if (!silent) setLoading(false);
        }
    }, [activeTab, nextVideoCursor]);

    useEffect(() => {
        loadVideos(false);
        // The bootstrap may have started the first background discovery.
        const refreshTimer = window.setTimeout(() => loadVideos(false, true), 4_000);
        const catalogTimer = window.setInterval(() => loadVideos(false, true), 30_000);
        return () => {
            window.clearTimeout(refreshTimer);
            window.clearInterval(catalogTimer);
        };
        // nextVideoCursor must not restart the initial load after pagination.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, settings]);

    const toggleWatched = (id: string) => {
        const willBeWatched = !watchedIds.includes(id);
        setWatchedIds((prev) =>
            willBeWatched ? [...prev, id] : prev.filter((i) => i !== id)
        );
        const op = willBeWatched ? postWatched(id) : deleteWatched(id);
        op.catch((err) => {
            console.error(`Failed to sync watched state for ${id}, rolling back:`, err);
            setWatchedIds((prev) =>
                willBeWatched ? prev.filter((i) => i !== id) : [...prev, id]
            );
        });
    };

    const filteredVideos = videos.filter((v) =>
        activeTab === "new" ? !watchedIds.includes(v.id) : watchedIds.includes(v.id)
    );

    const selectedVideoIndex = selectedVideo
        ? filteredVideos.findIndex((video) => video.id === selectedVideo.id)
        : -1;
    const previousVideo =
        selectedVideoIndex === -1 || filteredVideos.length === 0
            ? null
            : filteredVideos[(selectedVideoIndex - 1 + filteredVideos.length) % filteredVideos.length];
    const nextVideo =
        selectedVideoIndex === -1 || filteredVideos.length === 0
            ? null
            : filteredVideos[(selectedVideoIndex + 1) % filteredVideos.length];

    const markWatchedIfNeeded = useCallback((id: string) => {
        if (watchedIds.includes(id)) return;

        setWatchedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
        postWatched(id).catch((err) => {
            console.error(`Failed to sync watched state for ${id}, rolling back:`, err);
            setWatchedIds((prev) => prev.filter((watchedId) => watchedId !== id));
        });
    }, [watchedIds]);

    const showAdjacentVideo = useCallback((direction: "previous" | "next") => {
        if (!selectedVideo || filteredVideos.length === 0) return;

        markWatchedIfNeeded(selectedVideo.id);

        const currentIndex = filteredVideos.findIndex((video) => video.id === selectedVideo.id);
        const offset = direction === "previous" ? -1 : 1;
        const nextIndex =
            currentIndex === -1
                ? 0
                : (currentIndex + offset + filteredVideos.length) % filteredVideos.length;
        setSelectedVideo(filteredVideos[nextIndex]);
    }, [filteredVideos, markWatchedIfNeeded, selectedVideo]);

    return (
        <div className="min-h-screen bg-background text-foreground selection:bg-zinc-800">
            {/* Header */}
            <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-8">
                    <div className="flex items-center space-x-2">
                        <div className="rounded-lg bg-primary p-1.5 text-primary-foreground focus-within:ring-2">
                            <Music2 className="h-5 w-5" />
                        </div>
                        <h1 className="text-xl font-bold tracking-tight">Fresh Music</h1>
                    </div>

                    <div className="flex items-center space-x-4">
                        <nav className="hidden sm:flex space-x-1 rounded-lg bg-zinc-900/50 p-1">
                            <button
                                onClick={() => setActiveTab("new")}
                                className={`flex items-center space-x-2 rounded-md px-3 py-1.5 text-sm font-medium ${activeTab === "new"
                                    ? "bg-zinc-800 text-white shadow-sm"
                                    : "text-zinc-500 hover:text-zinc-300"
                                    }`}
                            >
                                <PlayCircle className="h-4 w-4" />
                                <span>New</span>
                            </button>
                            <button
                                onClick={() => setActiveTab("history")}
                                className={`flex items-center space-x-2 rounded-md px-3 py-1.5 text-sm font-medium ${activeTab === "history"
                                    ? "bg-zinc-800 text-white shadow-sm"
                                    : "text-zinc-500 hover:text-zinc-300"
                                    }`}
                            >
                                <History className="h-4 w-4" />
                                <span>History</span>
                            </button>
                        </nav>

                        <Link
                            href="/settings"
                            aria-label="Open settings"
                            className="rounded-full bg-zinc-900 p-2.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors border border-zinc-800"
                        >
                            <Settings2 className="h-5 w-5" />
                        </Link>
                    </div>
                </div>

                {/* Mobile Tabs */}
                <div className="sm:hidden flex justify-center border-t border-zinc-900 bg-zinc-950 px-4 py-2">
                    <nav className="flex w-full space-x-1 rounded-lg bg-zinc-900/50 p-1">
                        <button
                            onClick={() => setActiveTab("new")}
                            className={`flex-1 flex items-center justify-center space-x-2 rounded-md py-1.5 text-sm font-medium ${activeTab === "new"
                                ? "bg-zinc-800 text-white shadow-sm"
                                : "text-zinc-500 hover:text-zinc-300"
                                }`}
                        >
                            <PlayCircle className="h-4 w-4" />
                            <span>New</span>
                        </button>
                        <button
                            onClick={() => setActiveTab("history")}
                            className={`flex-1 flex items-center justify-center space-x-2 rounded-md py-1.5 text-sm font-medium ${activeTab === "history"
                                ? "bg-zinc-800 text-white shadow-sm"
                                : "text-zinc-500 hover:text-zinc-300"
                                }`}
                        >
                            <History className="h-4 w-4" />
                            <span>History</span>
                        </button>
                    </nav>
                </div>
            </header>

            {/* Main Content */}
            <main className="mx-auto max-w-7xl px-4 py-8 md:px-8">
                {videoLoadError && !loading && (
                    <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 text-amber-200">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                        <p className="text-sm leading-relaxed">{videoLoadError}</p>
                    </div>
                )}
                {loading ? (
                    <div className="flex h-[60vh] flex-col items-center justify-center space-y-4">
                        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
                        <p className="text-sm font-medium text-zinc-500">Curating your latest releases...</p>
                    </div>
                ) : filteredVideos.length > 0 ? (
                    <>
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {filteredVideos.map((video) => (
                                <VideoCard
                                    key={video.id}
                                    video={video}
                                    isWatched={watchedIds.includes(video.id)}
                                    onToggleWatched={toggleWatched}
                                    onClick={setSelectedVideo}
                                />
                            ))}
                        </div>
                        {nextVideoCursor && (
                            <div className="mt-8 flex justify-center">
                                <button
                                    onClick={() => loadVideos(true)}
                                    disabled={loading}
                                    className="rounded-lg border border-border px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
                                >
                                    Load more
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex h-[40vh] flex-col items-center justify-center space-y-3 rounded-2xl border border-dashed border-border p-12 text-center">
                        <div className="rounded-full bg-zinc-900 p-4">
                            {activeTab === "new" ? (
                                <Music className="h-8 w-8 text-zinc-600" />
                            ) : (
                                <History className="h-8 w-8 text-zinc-600" />
                            )}
                        </div>
                        <h2 className="text-lg font-semibold">
                            {activeTab === "new" ? "All caught up!" : "No history yet"}
                        </h2>
                        <p className="max-w-xs text-sm text-zinc-500">
                            {activeTab === "new"
                                ? "You've watched all the latest releases from your favorite channels."
                                : "Songs you've watched will appear here."}
                        </p>
                    </div>
                )}
            </main>

            {/* Modals */}
            <VideoModal
                video={selectedVideo}
                previousVideo={previousVideo}
                nextVideo={nextVideo}
                onClose={() => setSelectedVideo(null)}
                onPrevious={() => showAdjacentVideo("previous")}
                onNext={() => showAdjacentVideo("next")}
                hasAdjacentVideo={filteredVideos.length > 1}
            />
        </div>
    );
}
