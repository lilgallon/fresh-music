"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import ChannelSettings from "./ChannelSettings";
import AppNavbar from "./AppNavbar";
import type { YouTubeChannel } from "@/types/youtube";
import {
    type AppSettings,
    DEFAULT_SETTINGS,
    bootstrapApplicationCache,
    deleteChannel,
    fetchWatched,
    putChannels,
    putSettings,
    putWatched,
    readChannelsCache,
    readSettingsCache,
    readWatchedCache,
    upsertChannel,
    writeChannelsCache,
    writeSettingsCache,
    writeWatchedCache,
} from "@/lib/storage-client";

export default function SettingsPage() {
    const [channels, setChannels] = useState<YouTubeChannel[]>([]);
    const [watchedIds, setWatchedIds] = useState<string[]>([]);
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const cachedChannels = readChannelsCache();
        const cachedWatched = readWatchedCache();
        const cachedSettings = readSettingsCache();
        if (cachedChannels) setChannels(cachedChannels);
        if (cachedWatched) setWatchedIds(cachedWatched);
        if (cachedSettings) setSettings(cachedSettings);

        bootstrapApplicationCache({
            channels: cachedChannels,
            watchedIds: cachedWatched,
            settings: cachedSettings,
        }).then((result) => {
            setChannels(result.channels);
            setWatchedIds(result.watchedIds);
            setSettings(result.settings);
            writeChannelsCache(result.channels);
            writeWatchedCache(result.watchedIds);
            writeSettingsCache(result.settings);
        }).catch((cause) => {
            setError(cause instanceof Error ? cause.message : "Could not load settings.");
        }).finally(() => setLoading(false));
    }, []);

    const addChannel = async (channel: YouTubeChannel) => {
        if (channels.some((candidate) => candidate.channelId === channel.channelId)) return;
        const previous = channels;
        const next = [...channels, channel];
        setChannels(next);
        writeChannelsCache(next);
        try {
            await upsertChannel(channel);
        } catch (cause) {
            setChannels(previous);
            writeChannelsCache(previous);
            throw cause;
        }
    };

    const removeChannel = async (channelId: string) => {
        const previous = channels;
        const next = channels.filter((channel) => channel.channelId !== channelId);
        setChannels(next);
        writeChannelsCache(next);
        try {
            await deleteChannel(channelId);
        } catch (cause) {
            setChannels(previous);
            writeChannelsCache(previous);
            throw cause;
        }
    };

    const updateSettings = async (next: AppSettings) => {
        const previous = settings;
        setSettings(next);
        try {
            const saved = await putSettings(next);
            setSettings(saved);
            writeSettingsCache(saved);
        } catch (cause) {
            setSettings(previous);
            writeSettingsCache(previous);
            throw cause;
        }
    };

    const importData = async (nextChannels: YouTubeChannel[], nextWatchedIds: string[]) => {
        const [savedChannels, savedWatched] = await Promise.all([
            putChannels(nextChannels),
            putWatched(nextWatchedIds),
        ]);
        setChannels(savedChannels);
        setWatchedIds(savedWatched);
        writeChannelsCache(savedChannels);
        writeWatchedCache(savedWatched);
    };

    const refreshWatched = async () => {
        const current = await fetchWatched();
        setWatchedIds(current);
        writeWatchedCache(current);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background text-foreground">
                <AppNavbar activeSection="settings" />
                <main className="flex min-h-[60vh] items-center justify-center text-zinc-500">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading settings…
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <AppNavbar activeSection="settings" />
            {error && (
                <div className="fixed left-1/2 top-20 z-50 flex w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 items-start gap-2 rounded-lg border border-amber-900/50 bg-amber-950 p-3 text-xs text-amber-200 shadow-xl">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
                </div>
            )}
            <ChannelSettings
                followedChannels={channels}
                watchedIds={watchedIds}
                settings={settings}
                onAddChannel={addChannel}
                onRemoveChannel={removeChannel}
                onUpdateSettings={updateSettings}
                onImportData={importData}
                onWatchedReconciled={refreshWatched}
            />
        </div>
    );
}
