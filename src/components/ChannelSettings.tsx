"use client";

import { useState } from "react";
import { X, Search, Plus, Trash2, Settings, Loader2, Download, Upload } from "lucide-react";
import { YouTubeChannel } from "@/types/youtube";
import { SearchResultChannel, searchChannels } from "@/lib/youtube";
import { AppSettings } from "@/lib/storage-client";
import Image from "next/image";

interface ChannelSettingsProps {
    followedChannels: YouTubeChannel[];
    watchedIds: string[];
    settings: AppSettings;
    onAddChannel: (channel: YouTubeChannel) => void | Promise<void>;
    onRemoveChannel: (channelId: string) => void | Promise<void>;
    onUpdateSettings: (settings: AppSettings) => void | Promise<void>;
    onImportData: (channels: YouTubeChannel[], watchedIds: string[]) => void | Promise<void>;
    onClose: () => void;
}

export default function ChannelSettings({
    followedChannels,
    watchedIds,
    settings,
    onAddChannel,
    onRemoveChannel,
    onUpdateSettings,
    onImportData,
    onClose,
}: ChannelSettingsProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<SearchResultChannel[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        const results = await searchChannels(searchQuery);
        setSearchResults(results);
        setIsSearching(false);
    };

    const handleExport = () => {
        const data = {
            followedChannels,
            watchedVideoIds: watchedIds,
            settings,
            exportedAt: new Date().toISOString(),
            version: "1.0",
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `fresh-music-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const content = event.target?.result as string;
                const data = JSON.parse(content);

                if (!Array.isArray(data.followedChannels) || !Array.isArray(data.watchedVideoIds)) {
                    throw new Error("Invalid backup format");
                }

                if (confirm("This will overwrite your current settings. Continue?")) {
                    if (data.settings?.videoLookbackDays) {
                        onUpdateSettings({
                            videoLookbackDays: Number(data.settings.videoLookbackDays),
                        });
                    }
                    onImportData(data.followedChannels, data.watchedVideoIds);
                }
            } catch (err) {
                alert("Failed to import: Invalid or corrupted file.");
                console.error(err);
            }
        };
        reader.readAsText(file);
    };

    const addChannel = (result: SearchResultChannel) => {
        if (followedChannels.some((c) => c.channelId === result.id)) return;

        const newChannel: YouTubeChannel = {
            channelId: result.id,
            name: result.title,
            isMusicOnly: true,
            thumbnail: result.thumbnail,
            description: result.description,
        };

        onAddChannel(newChannel);
    };

    const removeChannel = (channelId: string) => {
        onRemoveChannel(channelId);
    };

    // Filter out search results that are already followed
    const filteredSearchResults = searchResults.filter(
        (result) => !followedChannels.some((c) => c.channelId === result.id)
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200 overflow-x-hidden transition-all">
            <div className="relative flex h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-zinc-900 shadow-2xl animate-in zoom-in-95 duration-200 border border-zinc-800">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-zinc-800 p-6 flex-shrink-0">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                            <Settings className="h-5 w-5 text-zinc-400" />
                            <h2 className="text-xl font-semibold text-white">Manage & Backup</h2>
                        </div>
                    </div>

                    <div className="flex items-center space-x-2">
                        <div className="flex items-center bg-zinc-800/50 rounded-lg p-1 border border-zinc-700">
                            <button
                                onClick={handleExport}
                                className="flex items-center space-x-1 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-700 rounded-md transition-colors"
                                title="Export data to JSON"
                            >
                                <Download className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Export</span>
                            </button>
                            <div className="w-[1px] h-4 bg-zinc-700 mx-1" />
                            <label className="flex items-center space-x-1 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-700 rounded-md transition-colors cursor-pointer" title="Import data from JSON">
                                <Upload className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Import</span>
                                <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                            </label>
                        </div>

                        <button
                            onClick={onClose}
                            className="rounded-full p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                        >
                            <X className="h-6 w-6" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-8">
                    {/* Fetch Window Section */}
                    <section className="space-y-4">
                        <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Video Window</h3>
                        <div className="rounded-xl border border-zinc-800 bg-zinc-800/30 p-4">
                            <label htmlFor="video-lookback" className="block text-sm font-medium text-white">
                                Fetch videos from the last
                            </label>
                            <div className="mt-3 flex items-center gap-3">
                                <select
                                    id="video-lookback"
                                    value={settings.videoLookbackDays}
                                    onChange={(e) =>
                                        onUpdateSettings({
                                            ...settings,
                                            videoLookbackDays: Number(e.target.value),
                                        })
                                    }
                                    className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-zinc-500"
                                >
                                    <option value={7}>7 days</option>
                                    <option value={14}>14 days</option>
                                    <option value={30}>30 days</option>
                                    <option value={90}>90 days</option>
                                    <option value={180}>180 days</option>
                                    <option value={365}>1 year</option>
                                </select>
                                <span className="text-sm text-zinc-500">per channel</span>
                            </div>
                        </div>
                    </section>

                    {/* Search Section */}
                    <section className="space-y-4">
                        <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Follow New Channels</h3>
                        <div className="flex space-x-2">
                            <div className="relative flex-1 min-w-0">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                                <input
                                    type="text"
                                    placeholder="Search for a channel..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                                    className="w-full rounded-lg bg-zinc-800/50 py-2.5 pl-10 pr-4 text-sm text-white border border-zinc-700 focus:border-zinc-500 focus:outline-none transition-colors"
                                />
                            </div>
                            <button
                                onClick={handleSearch}
                                disabled={isSearching}
                                className="shrink-0 rounded-lg bg-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-white disabled:opacity-50 transition-colors"
                            >
                                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                            </button>
                        </div>

                        {/* Search Results */}
                        {filteredSearchResults.length > 0 && (
                            <div className="grid gap-2 animate-in slide-in-from-top-2 duration-200">
                                {filteredSearchResults.map((result) => (
                                    <div
                                        key={result.id}
                                        className="flex items-center justify-between gap-4 rounded-xl bg-zinc-800/30 p-3 border border-zinc-800 transition-colors hover:bg-zinc-800/50 overflow-hidden"
                                    >
                                        <div className="flex flex-1 items-center space-x-3 min-w-0">
                                            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-zinc-800">
                                                <Image src={result.thumbnail} alt={result.title} fill className="object-cover" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-white truncate">{result.title}</p>
                                                <p className="text-xs text-zinc-500 truncate">{result.description}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => addChannel(result)}
                                            className="shrink-0 rounded-full bg-primary p-2 text-primary-foreground hover:bg-white transition-colors"
                                        >
                                            <Plus className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Followed Section */}
                    <section className="space-y-4">
                        <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Current Subscriptions</h3>
                        <div className="grid gap-2">
                            {followedChannels.length > 0 ? (
                                followedChannels.map((channel) => (
                                    <div
                                        key={channel.channelId}
                                        className="flex items-center justify-between gap-4 rounded-xl bg-zinc-800/50 p-3 border border-zinc-800 group transition-colors hover:bg-zinc-800/70 overflow-hidden"
                                    >
                                        <div className="flex flex-1 items-center space-x-3 min-w-0">
                                            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold">
                                                {channel.thumbnail ? (
                                                    <Image src={channel.thumbnail} alt={channel.name} fill className="object-cover" />
                                                ) : (
                                                    <span>{channel.name.charAt(0)}</span>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-white truncate">{channel.name}</p>
                                                {channel.description && <p className="text-xs text-zinc-500 truncate">{channel.description}</p>}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => removeChannel(channel.channelId)}
                                            className="shrink-0 rounded-full p-2 text-zinc-500 hover:bg-zinc-700/50 hover:text-red-400 transition-all sm:opacity-0 group-hover:opacity-100 focus:opacity-100"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-zinc-600 italic">No channels followed yet. Search above to add some!</p>
                            )}
                        </div>
                    </section>
                </div>

                {/* Footer */}
                <div className="border-t border-zinc-800 bg-zinc-900/50 p-6 flex-shrink-0">
                    <button
                        onClick={onClose}
                        className="w-full rounded-lg bg-zinc-800 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
