"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, History, Loader2, Music } from "lucide-react";
import type { YouTubeChannel, YouTubeVideo } from "@/types/youtube";
import type { YouTubeIntegrationPublicStatus } from "@/types/youtube-integration";
import {
    AppSettings,
    DEFAULT_SETTINGS,
    bootstrapApplicationCache,
    deleteWatched,
    fetchCatalogVideos,
    fetchWatched,
    fetchYouTubeIntegration,
    likeYouTubeVideo,
    postWatched,
    readChannelsCache,
    readSettingsCache,
    readWatchedCache,
    undoYouTubeVideoLike,
    writeChannelsCache,
    writeSettingsCache,
    writeWatchedCache,
} from "@/lib/storage-client";
import { advanceNewVideoSession, createNewVideoSession } from "@/lib/new-video-session";
import ActionToast, { ActionToastMessage } from "./ActionToast";
import AppNavbar from "./AppNavbar";
import VideoCard from "./VideoCard";
import VideoModal, { type NewVideoAction } from "./VideoModal";
import YouTubeQuotaBanner from "./YouTubeQuotaBanner";

const ACTION_ANIMATION_MS = 300;
// Worst case before the toast expires: rate the video, remove its playlist item,
// then restore the previous rating. Playlist re-insertion may remain queued.
const LIKE_WITH_UNDO_WRITE_MARGIN = 150;
const LIKE_WITH_UNDO_TOTAL_MARGIN = 151;

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function Dashboard() {
    const [videos, setVideos] = useState<YouTubeVideo[]>([]);
    const [followedChannels, setFollowedChannels] = useState<YouTubeChannel[]>([]);
    const [watchedIds, setWatchedIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [videoLoadError, setVideoLoadError] = useState<string | null>(null);
    const [nextVideoCursor, setNextVideoCursor] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"new" | "history">("new");
    const [selectedVideo, setSelectedVideo] = useState<YouTubeVideo | null>(null);
    const [newVideoSession, setNewVideoSession] = useState<YouTubeVideo[]>([]);
    const [actionInFlight, setActionInFlight] = useState<NewVideoAction | null>(null);
    const [feedbackAction, setFeedbackAction] = useState<NewVideoAction | null>(null);
    const [youtubeIntegration, setYouTubeIntegration] = useState<YouTubeIntegrationPublicStatus | null>(null);
    const [toast, setToast] = useState<ActionToastMessage | null>(null);
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const hydratedRef = useRef(false);
    const toastIdRef = useRef(0);
    const originVideoIdRef = useRef<string | null>(null);

    const showToast = useCallback((message: Omit<ActionToastMessage, "id">) => {
        toastIdRef.current += 1;
        setToast({ ...message, id: toastIdRef.current });
    }, []);

    const dismissToast = useCallback((toastId: number) => {
        setToast((current) => current?.id === toastId ? null : current);
    }, []);

    const focusOriginCard = useCallback(() => {
        const videoId = originVideoIdRef.current;
        if (!videoId) return;
        window.requestAnimationFrame(() => {
            document.querySelector<HTMLElement>(`[data-video-open="${videoId}"]`)?.focus();
        });
    }, []);

    useEffect(() => {
        const requestedTab = new URLSearchParams(window.location.search).get("tab");
        if (requestedTab === "history" || requestedTab === "new") setActiveTab(requestedTab);

        const cachedChannels = readChannelsCache();
        const cachedWatched = readWatchedCache();
        const cachedSettings = readSettingsCache();
        if (cachedChannels) setFollowedChannels(cachedChannels);
        if (cachedWatched) setWatchedIds(cachedWatched);
        if (cachedSettings) setSettings(cachedSettings);

        void (async () => {
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
            } catch (error) {
                console.error("Failed to sync with server, using local cache:", error);
            } finally {
                hydratedRef.current = true;
            }
        })();
    }, []);

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

    const refreshYouTubeStatus = useCallback(async () => {
        try {
            setYouTubeIntegration(await fetchYouTubeIntegration());
        } catch {
            setYouTubeIntegration(null);
        }
    }, []);

    useEffect(() => {
        void refreshYouTubeStatus();
        const timer = window.setInterval(refreshYouTubeStatus, 30_000);
        window.addEventListener("focus", refreshWatchedState);
        window.addEventListener("focus", refreshYouTubeStatus);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("focus", refreshWatchedState);
            window.removeEventListener("focus", refreshYouTubeStatus);
        };
    }, [refreshWatchedState, refreshYouTubeStatus]);

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
        void loadVideos(false);
        const refreshTimer = window.setTimeout(() => void loadVideos(false, true), 4_000);
        const catalogTimer = window.setInterval(() => void loadVideos(false, true), 30_000);
        return () => {
            window.clearTimeout(refreshTimer);
            window.clearInterval(catalogTimer);
        };
        // nextVideoCursor must not restart the initial load after pagination.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, settings]);

    const filteredVideos = useMemo(() => videos.filter((video) =>
        activeTab === "new" ? !watchedIds.includes(video.id) : watchedIds.includes(video.id)
    ), [activeTab, videos, watchedIds]);

    const selectTab = (tab: "new" | "history") => {
        setSelectedVideo(null);
        setNewVideoSession([]);
        setActionInFlight(null);
        setFeedbackAction(null);
        setActiveTab(tab);
        window.history.replaceState({}, "", tab === "history" ? "/?tab=history" : "/");
    };

    const openVideo = (video: YouTubeVideo) => {
        originVideoIdRef.current = video.id;
        if (activeTab === "new") {
            setNewVideoSession(createNewVideoSession(filteredVideos, video.id));
        }
        setSelectedVideo(video);
    };

    const historyVideoIndex = selectedVideo
        ? filteredVideos.findIndex((video) => video.id === selectedVideo.id)
        : -1;
    const previousHistoryVideo = historyVideoIndex < 0 || filteredVideos.length === 0
        ? null
        : filteredVideos[(historyVideoIndex - 1 + filteredVideos.length) % filteredVideos.length];
    const nextHistoryVideo = historyVideoIndex < 0 || filteredVideos.length === 0
        ? null
        : filteredVideos[(historyVideoIndex + 1) % filteredVideos.length];

    const showHistoryVideo = (direction: "previous" | "next") => {
        if (!selectedVideo || filteredVideos.length < 2) return;
        const currentIndex = filteredVideos.findIndex((video) => video.id === selectedVideo.id);
        const offset = direction === "previous" ? -1 : 1;
        const nextIndex = (currentIndex + offset + filteredVideos.length) % filteredVideos.length;
        setSelectedVideo(filteredVideos[nextIndex]);
    };

    const likeDisabledReason = useMemo(() => {
        if (!youtubeIntegration) return "vérification du compte YouTube";
        if (!youtubeIntegration.configured) return "OAuth YouTube non configuré";
        if (!youtubeIntegration.connected) return "aucun compte YouTube connecté";
        if (youtubeIntegration.quota.pausedUntil) return "quota YouTube temporairement suspendu";
        const remainingWrites = youtubeIntegration.quota.writeLimit - youtubeIntegration.quota.writeUnits;
        const remainingTotal = youtubeIntegration.quota.totalLimit - youtubeIntegration.quota.estimatedTotalUnits;
        if (
            remainingWrites < LIKE_WITH_UNDO_WRITE_MARGIN
            || remainingTotal < LIKE_WITH_UNDO_TOTAL_MARGIN
        ) {
            return "quota insuffisant pour le Like et son annulation";
        }
        return null;
    }, [youtubeIntegration]);

    const restoreSession = (session: YouTubeVideo[], video: YouTubeVideo) => {
        setNewVideoSession(session);
        setSelectedVideo(video);
    };

    const advanceFromVideo = (session: YouTubeVideo[], video: YouTubeVideo) => {
        const remaining = advanceNewVideoSession(session, video.id);
        setNewVideoSession(remaining);
        setSelectedVideo(remaining[0] ?? null);
        if (remaining.length === 0) focusOriginCard();
        return remaining;
    };

    async function runNewAction(action: NewVideoAction): Promise<void> {
        if (!selectedVideo || activeTab !== "new" || actionInFlight) return;
        if (action === "like" && likeDisabledReason) return;

        const video = selectedVideo;
        const sessionBefore = newVideoSession.length > 0
            ? [...newVideoSession]
            : createNewVideoSession(filteredVideos, video.id);
        setActionInFlight(action);

        try {
            if (action === "stop") {
                setFeedbackAction(action);
                await wait(ACTION_ANIMATION_MS);
                setSelectedVideo(null);
                setNewVideoSession(sessionBefore);
                focusOriginCard();
                showToast({
                    message: `Lecture de « ${video.title} » arrêtée`,
                    tone: "info",
                    action: () => restoreSession(sessionBefore, video),
                });
                return;
            }

            if (action === "later") {
                setFeedbackAction(action);
                await wait(ACTION_ANIMATION_MS);
                advanceFromVideo(sessionBefore, video);
                showToast({
                    message: `« ${video.title} » gardée pour plus tard`,
                    tone: "info",
                    action: () => restoreSession(sessionBefore, video),
                });
                return;
            }

            if (action === "seen") {
                await postWatched(video.id);
                setFeedbackAction(action);
                await wait(ACTION_ANIMATION_MS);
                setWatchedIds((previous) => previous.includes(video.id) ? previous : [...previous, video.id]);
                advanceFromVideo(sessionBefore, video);
                showToast({
                    message: `« ${video.title} » marquée comme vue`,
                    tone: "success",
                    action: async () => {
                        await deleteWatched(video.id);
                        setWatchedIds((previous) => previous.filter((id) => id !== video.id));
                        restoreSession(sessionBefore, video);
                    },
                });
                return;
            }

            const likeResult = await likeYouTubeVideo(video.id);
            setFeedbackAction(action);
            await wait(ACTION_ANIMATION_MS);
            setWatchedIds((previous) => previous.includes(video.id) ? previous : [...previous, video.id]);
            advanceFromVideo(sessionBefore, video);
            void refreshYouTubeStatus();
            showToast({
                message: `« ${video.title} » likée sur YouTube`,
                tone: "success",
                action: async () => {
                    await undoYouTubeVideoLike(video.id, likeResult.previousRating);
                    setWatchedIds((previous) => previous.filter((id) => id !== video.id));
                    restoreSession(sessionBefore, video);
                    void refreshYouTubeStatus();
                },
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "L’action a échoué.";
            showToast({
                message,
                tone: "error",
                actionLabel: "Réessayer",
                action: () => runNewAction(action),
            });
        } finally {
            setFeedbackAction(null);
            setActionInFlight(null);
        }
    }

    async function toggleWatched(video: YouTubeVideo): Promise<void> {
        const wasWatched = watchedIds.includes(video.id);
        setWatchedIds((previous) => wasWatched
            ? previous.filter((id) => id !== video.id)
            : [...previous, video.id]
        );

        try {
            if (wasWatched) {
                await deleteWatched(video.id);
                return;
            }
            await postWatched(video.id);
            showToast({
                message: `« ${video.title} » marquée comme vue`,
                tone: "success",
                action: async () => {
                    await deleteWatched(video.id);
                    setWatchedIds((previous) => previous.filter((id) => id !== video.id));
                },
            });
        } catch (error) {
            setWatchedIds((previous) => wasWatched
                ? previous.includes(video.id) ? previous : [...previous, video.id]
                : previous.filter((id) => id !== video.id)
            );
            showToast({
                message: error instanceof Error ? error.message : "Impossible de modifier le statut de la vidéo.",
                tone: "error",
                actionLabel: "Réessayer",
                action: () => toggleWatched(video),
            });
        }
    }

    const closeHistoryModal = () => {
        setSelectedVideo(null);
        focusOriginCard();
    };

    return (
        <div className="min-h-screen bg-background text-foreground selection:bg-zinc-800">
            <AppNavbar activeSection={activeTab} onSelectTab={selectTab} />

            <main className="mx-auto max-w-7xl px-4 py-8 md:px-8">
                <YouTubeQuotaBanner />
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
                                    mode={activeTab}
                                    isWatched={watchedIds.includes(video.id)}
                                    onToggleWatched={(selected) => void toggleWatched(selected)}
                                    onClick={openVideo}
                                />
                            ))}
                        </div>
                        {nextVideoCursor && (
                            <div className="mt-8 flex justify-center">
                                <button
                                    type="button"
                                    onClick={() => void loadVideos(true)}
                                    disabled={loading}
                                    className="rounded-lg border border-border px-4 py-2 text-sm text-zinc-300 transition hover:bg-zinc-900 disabled:opacity-50"
                                >
                                    Charger la suite
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex min-h-[40vh] flex-col items-center justify-center space-y-3 rounded-2xl border border-dashed border-border p-8 text-center sm:p-12">
                        <div className="rounded-full bg-zinc-900 p-4">
                            {activeTab === "new" ? <Music className="h-8 w-8 text-zinc-600" /> : <History className="h-8 w-8 text-zinc-600" />}
                        </div>
                        <h2 className="text-lg font-semibold">
                            {activeTab === "new"
                                ? nextVideoCursor ? "Cette page est terminée" : "All caught up!"
                                : "No history yet"}
                        </h2>
                        <p className="max-w-sm text-sm text-zinc-500">
                            {activeTab === "new"
                                ? nextVideoCursor
                                    ? "Il reste d’autres nouveautés à charger."
                                    : "You've watched all the latest releases from your favorite channels."
                                : "Songs you've watched will appear here."}
                        </p>
                        {nextVideoCursor && (
                            <button
                                type="button"
                                onClick={() => void loadVideos(true)}
                                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:scale-105"
                            >
                                Charger la suite
                            </button>
                        )}
                    </div>
                )}
            </main>

            <VideoModal
                video={selectedVideo}
                mode={activeTab}
                previousVideo={previousHistoryVideo}
                nextVideo={nextHistoryVideo}
                onClose={closeHistoryModal}
                onHistoryPrevious={() => showHistoryVideo("previous")}
                onHistoryNext={() => showHistoryVideo("next")}
                hasAdjacentVideo={filteredVideos.length > 1}
                onNewAction={(action) => void runNewAction(action)}
                actionInFlight={actionInFlight}
                feedbackAction={feedbackAction}
                likeDisabledReason={likeDisabledReason}
            />

            <ActionToast toast={toast} onDismiss={dismissToast} />
        </div>
    );
}
