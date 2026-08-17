"use client";

import { useEffect, useState } from "react";
import { Search, Plus, Trash2, Loader2, Download, Upload, Database } from "lucide-react";
import { YouTubeChannel } from "@/types/youtube";
import { AppSettings, SearchResultChannel, searchChannels } from "@/lib/storage-client";
import Image from "next/image";
import YouTubePlaylistSettings from "./YouTubePlaylistSettings";
import SettingHelpTooltip from "./SettingHelpTooltip";
import { validateAppSettings } from "@/lib/settings-validation";

interface ChannelSettingsProps {
    followedChannels: YouTubeChannel[];
    watchedIds: string[];
    settings: AppSettings;
    onAddChannel: (channel: YouTubeChannel) => void | Promise<void>;
    onRemoveChannel: (channelId: string) => void | Promise<void>;
    onUpdateSettings: (settings: AppSettings) => void | Promise<void>;
    onImportData: (channels: YouTubeChannel[], watchedIds: string[]) => void | Promise<void>;
    onWatchedReconciled: () => void | Promise<void>;
}

function SettingLabel({ htmlFor, label, help }: { htmlFor: string; label: string; help: string }) {
    return (
        <span className="flex items-center gap-1.5">
            <label htmlFor={htmlFor} className="text-sm font-medium text-white">{label}</label>
            <SettingHelpTooltip label={label}>{help}</SettingHelpTooltip>
        </span>
    );
}

export default function ChannelSettings({
    followedChannels,
    watchedIds,
    settings,
    onAddChannel,
    onRemoveChannel,
    onUpdateSettings,
    onImportData,
    onWatchedReconciled,
}: ChannelSettingsProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<SearchResultChannel[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [excludedTitleFilter, setExcludedTitleFilter] = useState(
        settings.excludedTitleRegexEnabled
            ? settings.excludedTitleTerms[0] ?? ""
            : settings.excludedTitleTerms.join(", ")
    );
    const [excludedTitleRegexEnabled, setExcludedTitleRegexEnabled] = useState(
        settings.excludedTitleRegexEnabled
    );
    const [minimumDuration, setMinimumDuration] = useState(
        settings.minimumDurationSeconds?.toString() ?? ""
    );
    const [maximumDuration, setMaximumDuration] = useState(
        settings.maximumDurationSeconds?.toString() ?? ""
    );
    const [isSavingFilters, setIsSavingFilters] = useState(false);
    const [syncDraft, setSyncDraft] = useState(settings);
    const [isSavingSync, setIsSavingSync] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [settingsSaveError, setSettingsSaveError] = useState<string | null>(null);

    useEffect(() => {
        setExcludedTitleFilter(settings.excludedTitleRegexEnabled
            ? settings.excludedTitleTerms[0] ?? ""
            : settings.excludedTitleTerms.join(", "));
        setExcludedTitleRegexEnabled(settings.excludedTitleRegexEnabled);
        setMinimumDuration(settings.minimumDurationSeconds?.toString() ?? "");
        setMaximumDuration(settings.maximumDurationSeconds?.toString() ?? "");
        setSyncDraft(settings);
    }, [settings]);

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        setSearchError(null);
        try {
            setSearchResults(await searchChannels(searchQuery));
        } catch (error) {
            setSearchError(error instanceof Error ? error.message : "Channel search failed");
        } finally {
            setIsSearching(false);
        }
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
                    if (data.settings) {
                        void Promise.resolve(onUpdateSettings({ ...settings, ...data.settings })).catch((error) => {
                            setSettingsSaveError(error instanceof Error ? error.message : "Could not import settings.");
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

    const addChannel = async (result: SearchResultChannel) => {
        if (followedChannels.some((c) => c.channelId === result.id)) return;

        const newChannel: YouTubeChannel = {
            channelId: result.id,
            name: result.title,
            isMusicOnly: true,
            thumbnail: result.thumbnail,
            description: result.description,
        };

        setSearchError(null);
        try {
            await onAddChannel(newChannel);
        } catch (error) {
            setSearchError(error instanceof Error ? error.message : "Could not follow this channel.");
        }
    };

    const removeChannel = async (channelId: string) => {
        setSearchError(null);
        try {
            await onRemoveChannel(channelId);
        } catch (error) {
            setSearchError(error instanceof Error ? error.message : "Could not remove this channel.");
        }
    };

    const saveContentFilters = async () => {
        setIsSavingFilters(true);
        setSettingsSaveError(null);
        try {
            const candidate = {
                ...settings,
                excludedTitleTerms: excludedTitleRegexEnabled
                    ? excludedTitleFilter.trim() ? [excludedTitleFilter.trim()] : []
                    : excludedTitleFilter
                        .split(",")
                        .map((term) => term.trim())
                        .filter(Boolean),
                excludedTitleRegexEnabled,
                minimumDurationSeconds: minimumDuration === "" ? null : Number(minimumDuration),
                maximumDurationSeconds: maximumDuration === "" ? null : Number(maximumDuration),
            };
            const validationError = validateAppSettings(candidate)[0];
            if (validationError) {
                setSettingsSaveError(validationError);
                return;
            }
            await onUpdateSettings(candidate);
        } catch (error) {
            setSettingsSaveError(error instanceof Error ? error.message : "Could not save content filters.");
        } finally {
            setIsSavingFilters(false);
        }
    };

    const syncSettingsError = validateAppSettings(syncDraft)[0] ?? null;

    const saveSynchronizationSettings = async () => {
        if (syncSettingsError) return;
        setIsSavingSync(true);
        setSettingsSaveError(null);
        try {
            await onUpdateSettings(syncDraft);
        } catch (error) {
            setSettingsSaveError(error instanceof Error ? error.message : "Could not save synchronization settings.");
        } finally {
            setIsSavingSync(false);
        }
    };

    // Filter out search results that are already followed
    const filteredSearchResults = searchResults.filter(
        (result) => !followedChannels.some((c) => c.channelId === result.id)
    );

    return (
        <main className="bg-background px-4 py-8 text-foreground md:px-8 md:py-10">
            <div className="mx-auto w-full max-w-7xl space-y-10">
                <header className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400">Configuration</p>
                    <h1 className="text-3xl font-bold tracking-tight text-white">Settings</h1>
                    <p className="max-w-3xl text-sm leading-relaxed text-zinc-500">
                        Manage the automatic playlist, YouTube quota, catalogue filters, subscriptions and backups.
                    </p>
                </header>

                <div className="space-y-10">
                    {/* YouTube Playlist Section */}
                    <section className="space-y-4">
                        <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Automatic Playlist</h3>
                        <YouTubePlaylistSettings settings={settings} onWatchedReconciled={onWatchedReconciled} />
                    </section>

                    <section className="space-y-4">
                        <h3 className="text-sm font-medium uppercase tracking-wider text-zinc-400">Channels</h3>
                        <div className="space-y-6 rounded-xl border border-zinc-800 bg-zinc-800/30 p-5">
                            <div className="space-y-3">
                                <div>
                                    <h4 className="text-sm font-medium text-white">Follow New Channels</h4>
                                    <p className="mt-1 text-xs text-zinc-500">Search YouTube and add a channel to your local catalogue.</p>
                                </div>
                                <div className="flex gap-2">
                                    <div className="relative min-w-0 flex-1">
                                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                                        <input
                                            type="text"
                                            placeholder="Search for a channel..."
                                            value={searchQuery}
                                            onChange={(event) => setSearchQuery(event.target.value)}
                                            onKeyDown={(event) => event.key === "Enter" && handleSearch()}
                                            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2.5 pl-10 pr-4 text-sm text-white transition-colors focus:border-zinc-500 focus:outline-none"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleSearch}
                                        disabled={isSearching}
                                        className="shrink-0 rounded-lg bg-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-900 transition-colors hover:bg-white disabled:opacity-50"
                                    >
                                        {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                                    </button>
                                </div>
                                {searchError && <p className="text-xs text-red-400">{searchError}</p>}

                                {filteredSearchResults.length > 0 && (
                                    <div className="grid animate-in gap-2 duration-200 slide-in-from-top-2 sm:grid-cols-2 xl:grid-cols-3">
                                        {filteredSearchResults.map((result) => (
                                            <div key={result.id} className="flex items-center justify-between gap-4 overflow-hidden rounded-xl border border-zinc-700/70 bg-zinc-900/70 p-3 transition-colors hover:border-zinc-600">
                                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-zinc-800">
                                                        <Image src={result.thumbnail} alt={result.title} fill className="object-cover" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-medium text-white">{result.title}</p>
                                                        <p className="truncate text-xs text-zinc-500">{result.description}</p>
                                                    </div>
                                                </div>
                                                <button type="button" onClick={() => void addChannel(result)} aria-label={`Follow ${result.title}`}
                                                    className="shrink-0 rounded-full bg-primary p-2 text-primary-foreground transition-colors hover:bg-white">
                                                    <Plus className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-3 border-t border-zinc-800 pt-5">
                                <div className="flex items-center justify-between gap-3">
                                    <h4 className="text-sm font-medium text-white">Current Subscriptions</h4>
                                    <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400">{followedChannels.length}</span>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                    {followedChannels.length > 0 ? (
                                        followedChannels.map((channel) => (
                                            <div key={channel.channelId} className="group flex items-center justify-between gap-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 transition-colors hover:border-zinc-700 hover:bg-zinc-900">
                                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800 font-bold text-zinc-400">
                                                        {channel.thumbnail ? (
                                                            <Image src={channel.thumbnail} alt={channel.name} fill className="object-cover" />
                                                        ) : (
                                                            <span>{channel.name.charAt(0)}</span>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-medium text-white">{channel.name}</p>
                                                        {channel.description && <p className="truncate text-xs text-zinc-500">{channel.description}</p>}
                                                    </div>
                                                </div>
                                                <button type="button" onClick={() => void removeChannel(channel.channelId)} aria-label={`Stop following ${channel.name}`}
                                                    className="shrink-0 rounded-full p-2 text-zinc-500 transition-all hover:bg-zinc-700/50 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100">
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-sm italic text-zinc-600">No channels followed yet. Search above to add some!</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>

                    <div className="grid items-start gap-8 lg:grid-cols-2">
                    {/* Content Filters Section */}
                    <section className="space-y-4">
                        <h3 className="text-sm font-medium uppercase tracking-wider text-zinc-400">
                            Content Filters
                        </h3>
                        <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-800/30 p-4">
                            <p className="text-xs leading-relaxed text-zinc-500">
                                Shorts and live broadcasts are always ignored. Add optional rules below;
                                title matching is case-insensitive.
                            </p>
                            <div>
                                <SettingLabel
                                    htmlFor="excluded-title-terms"
                                    label={excludedTitleRegexEnabled ? "Ignore titles matching" : "Ignore titles containing"}
                                    help={excludedTitleRegexEnabled
                                        ? "One case-insensitive regular expression. Enter the pattern without slash delimiters or flags."
                                        : "Case-insensitive fragments. A video containing any fragment is excluded from new releases and the playlist."}
                                />
                                <input
                                    id="excluded-title-terms"
                                    type="text"
                                    maxLength={100}
                                    value={excludedTitleFilter}
                                    onChange={(event) => setExcludedTitleFilter(event.target.value)}
                                    placeholder={excludedTitleRegexEnabled
                                        ? "^(?!.*live).*(official|audio)$"
                                        : "teaser, trailer, interview"}
                                    className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
                                />
                                <div className="mt-2 flex items-center justify-between gap-4">
                                    <p className="text-xs text-zinc-600">
                                        {excludedTitleRegexEnabled
                                            ? "The entire value is interpreted as one expression."
                                            : "Separate multiple fragments with commas."}
                                    </p>
                                    <label htmlFor="excluded-title-regex" className="flex shrink-0 items-center gap-2 text-xs text-zinc-400">
                                        <input
                                            id="excluded-title-regex"
                                            type="checkbox"
                                            checked={excludedTitleRegexEnabled}
                                            onChange={(event) => setExcludedTitleRegexEnabled(event.target.checked)}
                                            className="h-4 w-4 accent-red-600"
                                        />
                                        Regex
                                    </label>
                                </div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                    <SettingLabel htmlFor="minimum-duration" label="Minimum duration"
                                        help="Excludes shorter videos, such as excerpts or teasers. Leave empty for no minimum." />
                                    <div className="mt-2 flex items-center gap-2">
                                        <input
                                            id="minimum-duration"
                                            type="number"
                                            min={0}
                                            max={86400}
                                            value={minimumDuration}
                                            onChange={(event) => setMinimumDuration(event.target.value)}
                                            placeholder="No minimum"
                                            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
                                        />
                                        <span className="text-xs text-zinc-500">seconds</span>
                                    </div>
                                </div>
                                <div>
                                    <SettingLabel htmlFor="maximum-duration" label="Maximum duration"
                                        help="Excludes longer videos. Leave empty for no maximum." />
                                    <div className="mt-2 flex items-center gap-2">
                                        <input
                                            id="maximum-duration"
                                            type="number"
                                            min={0}
                                            max={86400}
                                            value={maximumDuration}
                                            onChange={(event) => setMaximumDuration(event.target.value)}
                                            placeholder="No maximum"
                                            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
                                        />
                                        <span className="text-xs text-zinc-500">seconds</span>
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={saveContentFilters}
                                disabled={isSavingFilters}
                                className="inline-flex items-center gap-2 rounded-lg bg-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-900 hover:bg-white disabled:opacity-50"
                            >
                                {isSavingFilters && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Save filters
                            </button>
                            {settingsSaveError && <p className="text-xs text-red-400">{settingsSaveError}</p>}
                        </div>
                    </section>
                    {/* Fetch Window Section */}
                    <section className="space-y-4">
                        <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Video Window</h3>
                        <div className="rounded-xl border border-zinc-800 bg-zinc-800/30 p-4">
                            <SettingLabel htmlFor="video-lookback" label="Fetch videos from the last"
                                help="Limits new releases shown and added to the playlist. It never deletes the local history." />
                            <div className="mt-3 flex items-center gap-3">
                                <select
                                    id="video-lookback"
                                    value={settings.videoLookbackDays}
                                    onChange={(e) =>
                                        void Promise.resolve(onUpdateSettings({
                                            ...settings,
                                            videoLookbackDays: Number(e.target.value),
                                        })).catch((error) => setSettingsSaveError(
                                            error instanceof Error ? error.message : "Could not save the video window."
                                        ))
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

                    </div>

                    <section className="space-y-4">
                        <h3 className="text-sm font-medium uppercase tracking-wider text-zinc-400">
                            Synchronization settings
                        </h3>
                        <div className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-800/30 p-4">
                            <div className="flex items-center justify-between gap-4">
                                <span className="flex items-center gap-1.5">
                                    <label htmlFor="automatic-sync" className="text-sm font-medium text-white">
                                        Automatic synchronization
                                    </label>
                                    <SettingHelpTooltip label="Automatic synchronization">
                                        Enables scheduled runs. Manual synchronization remains available when disabled.
                                    </SettingHelpTooltip>
                                </span>
                                <input
                                    id="automatic-sync"
                                    type="checkbox"
                                    checked={syncDraft.automaticSyncEnabled}
                                    onChange={(event) => setSyncDraft({
                                        ...syncDraft,
                                        automaticSyncEnabled: event.target.checked,
                                    })}
                                    className="h-4 w-4 accent-red-600"
                                />
                            </div>

                            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                                <div>
                                    <SettingLabel
                                        htmlFor="sync-interval"
                                        label="Sync interval"
                                        help="Time between discovery runs. A shorter interval finds releases sooner but uses more YouTube reads."
                                    />
                                    <div className="mt-2 flex items-center gap-2">
                                        <input id="sync-interval" type="number" min={5} max={1440}
                                            value={syncDraft.syncIntervalMinutes}
                                            onChange={(event) => setSyncDraft({ ...syncDraft, syncIntervalMinutes: Number(event.target.value) })}
                                            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white" />
                                        <span className="text-xs text-zinc-500">minutes</span>
                                    </div>
                                </div>
                                <div>
                                    <SettingLabel
                                        htmlFor="daily-quota"
                                        label="Daily YouTube quota"
                                        help="Total quota assigned to the GCP project. The standard value is 10,000; change it only if Google granted another limit."
                                    />
                                    <div className="mt-2 flex items-center gap-2">
                                        <input id="daily-quota" type="number" min={50} step={50}
                                            value={syncDraft.youtubeDailyQuotaUnits}
                                            onChange={(event) => setSyncDraft({ ...syncDraft, youtubeDailyQuotaUnits: Number(event.target.value) })}
                                            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white" />
                                        <span className="text-xs text-zinc-500">units</span>
                                    </div>
                                </div>
                                <div>
                                    <SettingLabel
                                        htmlFor="write-budget"
                                        label="Daily write budget"
                                        help="Quota reserved for playlist creations, additions and removals. Every playlist mutation costs 50 units."
                                    />
                                    <div className="mt-2 flex items-center gap-2">
                                        <input id="write-budget" type="number" min={0} step={50}
                                            value={syncDraft.youtubeDailyWriteBudgetUnits}
                                            onChange={(event) => setSyncDraft({ ...syncDraft, youtubeDailyWriteBudgetUnits: Number(event.target.value) })}
                                            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white" />
                                        <span className="text-xs text-zinc-500">units</span>
                                    </div>
                                </div>
                                <div>
                                    <SettingLabel
                                        htmlFor="max-adds"
                                        label="Maximum additions per sync"
                                        help="Fills a playlist progressively and prevents a sudden quota spike. Remaining additions stay queued."
                                    />
                                    <input id="max-adds" type="number" min={1} max={1000}
                                        value={syncDraft.maxPlaylistAddsPerSync}
                                        onChange={(event) => setSyncDraft({ ...syncDraft, maxPlaylistAddsPerSync: Number(event.target.value) })}
                                        className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white" />
                                </div>
                                <div>
                                    <SettingLabel
                                        htmlFor="max-removals"
                                        label="Maximum removals per sync"
                                        help="Limits playlist removals during one run. Remaining removals are retained and retried automatically."
                                    />
                                    <input id="max-removals" type="number" min={1} max={1000}
                                        value={syncDraft.maxPlaylistRemovalsPerSync}
                                        onChange={(event) => setSyncDraft({ ...syncDraft, maxPlaylistRemovalsPerSync: Number(event.target.value) })}
                                        className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white" />
                                </div>
                                <div>
                                    <SettingLabel
                                        htmlFor="max-pages"
                                        label="Maximum pages per channel"
                                        help="Limits uploads inspected per run. Each page contains at most 50 videos."
                                    />
                                    <input id="max-pages" type="number" min={1} max={100}
                                        value={syncDraft.maxDiscoveryPagesPerChannel}
                                        onChange={(event) => setSyncDraft({ ...syncDraft, maxDiscoveryPagesPerChannel: Number(event.target.value) })}
                                        className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white" />
                                </div>
                                <div>
                                    <SettingLabel
                                        htmlFor="short-cache"
                                        label="Shorts cache duration"
                                        help="Time before checking a Short again. A longer cache reduces network traffic without consuming Data API quota."
                                    />
                                    <div className="mt-2 flex items-center gap-2">
                                        <input id="short-cache" type="number" min={1} max={365}
                                            value={syncDraft.shortCacheTtlDays}
                                            onChange={(event) => setSyncDraft({ ...syncDraft, shortCacheTtlDays: Number(event.target.value) })}
                                            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white" />
                                        <span className="text-xs text-zinc-500">days</span>
                                    </div>
                                </div>
                            </div>
                            {syncSettingsError && <p className="text-xs text-red-400">{syncSettingsError}</p>}
                            {settingsSaveError && <p className="text-xs text-red-400">{settingsSaveError}</p>}
                            <button type="button" onClick={saveSynchronizationSettings}
                                disabled={isSavingSync || Boolean(syncSettingsError)}
                                className="inline-flex items-center gap-2 rounded-lg bg-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-900 hover:bg-white disabled:opacity-50">
                                {isSavingSync && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Save synchronization settings
                            </button>
                        </div>
                    </section>

                    <section className="space-y-4">
                        <h3 className="text-sm font-medium uppercase tracking-wider text-zinc-400">Data &amp; Backup</h3>
                        <div className="flex flex-col gap-5 rounded-xl border border-zinc-800 bg-zinc-800/30 p-5 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex items-start gap-3">
                                <div className="rounded-lg bg-zinc-800 p-2 text-zinc-400">
                                    <Database className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-white">Portable Fresh Music backup</p>
                                    <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-500">
                                        Export subscriptions, watched videos and settings to JSON, or restore them from a previous export.
                                        Importing replaces the corresponding data currently stored by the application.
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={handleExport}
                                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
                                >
                                    <Download className="h-4 w-4" /> Export backup
                                </button>
                                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-white">
                                    <Upload className="h-4 w-4" /> Import backup
                                    <input type="file" accept=".json,application/json" onChange={handleImport} className="sr-only" />
                                </label>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}
