"use client";

import { useEffect, useState } from "react";
import { YouTubeVideo } from "@/types/youtube";
import { channels } from "@/config/channels";
import { fetchAllVideos } from "@/lib/youtube";
import VideoCard from "./VideoCard";
import VideoModal from "./VideoModal";
import { Music, History, PlayCircle, Loader2, Music2 } from "lucide-react";

export default function Dashboard() {
    const [videos, setVideos] = useState<YouTubeVideo[]>([]);
    const [watchedIds, setWatchedIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"new" | "history">("new");
    const [selectedVideo, setSelectedVideo] = useState<YouTubeVideo | null>(null);

    // Load watched IDs from localStorage
    useEffect(() => {
        const stored = localStorage.getItem("watchedVideoIds");
        if (stored) {
            setWatchedIds(JSON.parse(stored));
        }
    }, []);

    // Save watched IDs to localStorage
    useEffect(() => {
        localStorage.setItem("watchedVideoIds", JSON.stringify(watchedIds));
    }, [watchedIds]);

    // Fetch videos on mount
    useEffect(() => {
        async function loadData() {
            setLoading(true);
            const data = await fetchAllVideos(channels);
            setVideos(data);
            setLoading(false);
        }
        loadData();
    }, []);

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

                    <nav className="flex space-x-1 rounded-lg bg-zinc-900/50 p-1">
                        <button
                            onClick={() => setActiveTab("new")}
                            className={`flex items-center space-x-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${activeTab === "new"
                                    ? "bg-zinc-800 text-white shadow-sm"
                                    : "text-zinc-500 hover:text-zinc-300"
                                }`}
                        >
                            <PlayCircle className="h-4 w-4" />
                            <span>New Releases</span>
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

            {/* Modal */}
            <VideoModal
                video={selectedVideo}
                onClose={() => setSelectedVideo(null)}
            />
        </div>
    );
}
