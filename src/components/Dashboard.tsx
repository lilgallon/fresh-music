"use client";

import { useEffect, useState, useCallback } from "react";
import { YouTubeVideo, YouTubeChannel } from "@/types/youtube";
import { channels as defaultChannels } from "@/config/channels";
import { fetchAllVideos, fetchChannelsInfo } from "@/lib/youtube";
import VideoCard from "./VideoCard";
import VideoModal from "./VideoModal";
import ChannelSettings from "./ChannelSettings";
import { Music, History, PlayCircle, Loader2, Music2, Settings2 } from "lucide-react";

export default function Dashboard() {
    const [videos, setVideos] = useState<YouTubeVideo[]>([]);
    const [followedChannels, setFollowedChannels] = useState<YouTubeChannel[]>([]);
    const [watchedIds, setWatchedIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"new" | "history">("new");
    const [selectedVideo, setSelectedVideo] = useState<YouTubeVideo | null>(null);
    const [showSettings, setShowSettings] = useState(false);

    // Load state from localStorage
    useEffect(() => {
        const storedChannels = localStorage.getItem("followedChannels");
        if (storedChannels) {
            setFollowedChannels(JSON.parse(storedChannels));
        } else {
            setFollowedChannels(defaultChannels);
        }

        const storedWatched = localStorage.getItem("watchedVideoIds");
        if (storedWatched) {
            setWatchedIds(JSON.parse(storedWatched));
        }
    }, []);

    // Enrich channels with missing metadata (thumbnail/description)
    useEffect(() => {
        const enrichMetadata = async () => {
            const missingMetaIds = followedChannels
                .filter(c => !c.thumbnail || !c.description)
                .map(c => c.channelId);

            if (missingMetaIds.length > 0) {
                const enrichedData = await fetchChannelsInfo(missingMetaIds);
                if (enrichedData.length > 0) {
                    setFollowedChannels(prev => prev.map(channel => {
                        const match = enrichedData.find(e => e.channelId === channel.channelId);
                        return match ? { ...channel, ...match } : channel;
                    }));
                }
            }
        };

        if (followedChannels.length > 0) {
            enrichMetadata();
            localStorage.setItem("followedChannels", JSON.stringify(followedChannels));
        }
    }, [followedChannels]);

    useEffect(() => {
        localStorage.setItem("watchedVideoIds", JSON.stringify(watchedIds));
    }, [watchedIds]);

    // Fetch videos when channels change
    const loadVideos = useCallback(async () => {
        if (followedChannels.length === 0) {
            setVideos([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        const data = await fetchAllVideos(followedChannels);
        setVideos(data);
        setLoading(false);
    }, [followedChannels]);

    useEffect(() => {
        loadVideos();
    }, [loadVideos]);

    const toggleWatched = (id: string) => {
        setWatchedIds((prev) =>
            prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
        );
    };

    const filteredVideos = videos.filter((v) =>
        activeTab === "new" ? !watchedIds.includes(v.id) : watchedIds.includes(v.id)
    );

    return (
        <div className="min-h-screen bg-background text-foreground selection:bg-zinc-800">
            {/* Header */}
            <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-8">
                    <div className="flex items-center space-x-2">
                        <div className="rounded-lg bg-primary p-1.5 text-primary-foreground">
                            <Music2 className="h-5 w-5" />
                        </div>
                        <h1 className="text-xl font-bold tracking-tight">Fresh Music</h1>
                    </div>

                    <div className="flex items-center space-x-4">
                        <nav className="hidden sm:flex space-x-1 rounded-lg bg-zinc-900/50 p-1">
                            <button
                                onClick={() => setActiveTab("new")}
                                className={`flex items-center space-x-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${activeTab === "new"
                                    ? "bg-zinc-800 text-white shadow-sm"
                                    : "text-zinc-500 hover:text-zinc-300"
                                    }`}
                            >
                                <PlayCircle className="h-4 w-4" />
                                <span>New</span>
                            </button>
                            <button
                                onClick={() => setActiveTab("history")}
                                className={`flex items-center space-x-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${activeTab === "history"
                                    ? "bg-zinc-800 text-white shadow-sm"
                                    : "text-zinc-500 hover:text-zinc-300"
                                    }`}
                            >
                                <History className="h-4 w-4" />
                                <span>History</span>
                            </button>
                        </nav>

                        <button
                            onClick={() => setShowSettings(true)}
                            className="rounded-full bg-zinc-900 p-2.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-all border border-zinc-800"
                        >
                            <Settings2 className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Mobile Tabs */}
                <div className="sm:hidden flex justify-center border-t border-zinc-900 bg-zinc-950 px-4 py-2">
                    <nav className="flex w-full space-x-1 rounded-lg bg-zinc-900/50 p-1">
                        <button
                            onClick={() => setActiveTab("new")}
                            className={`flex-1 flex items-center justify-center space-x-2 rounded-md py-1.5 text-sm font-medium transition-all ${activeTab === "new"
                                ? "bg-zinc-800 text-white shadow-sm"
                                : "text-zinc-500 hover:text-zinc-300"
                                }`}
                        >
                            <PlayCircle className="h-4 w-4" />
                            <span>New</span>
                        </button>
                        <button
                            onClick={() => setActiveTab("history")}
                            className={`flex-1 flex items-center justify-center space-x-2 rounded-md py-1.5 text-sm font-medium transition-all ${activeTab === "history"
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
                {loading ? (
                    <div className="flex h-[60vh] flex-col items-center justify-center space-y-4">
                        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
                        <p className="text-sm font-medium text-zinc-500">Curating your latest releases...</p>
                    </div>
                ) : filteredVideos.length > 0 ? (
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
                onClose={() => setSelectedVideo(null)}
            />

            {showSettings && (
                <ChannelSettings
                    followedChannels={followedChannels}
                    onUpdateChannels={setFollowedChannels}
                    onClose={() => setShowSettings(false)}
                />
            )}
        </div>
    );
}
