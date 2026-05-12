import { YouTubeChannel } from "@/types/youtube";

const LS_CHANNELS = "followedChannels";
const LS_WATCHED = "watchedVideoIds";
const LS_SETTINGS = "freshMusicSettings";

export interface AppSettings {
    videoLookbackDays: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
    videoLookbackDays: 30,
};

function readLS<T>(key: string): T | null {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

function writeLS(key: string, value: unknown): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, JSON.stringify(value));
}

export function readChannelsCache(): YouTubeChannel[] | null {
    return readLS<YouTubeChannel[]>(LS_CHANNELS);
}

export function readWatchedCache(): string[] | null {
    return readLS<string[]>(LS_WATCHED);
}

export function readSettingsCache(): AppSettings | null {
    return readLS<AppSettings>(LS_SETTINGS);
}

export function writeChannelsCache(channels: YouTubeChannel[]): void {
    writeLS(LS_CHANNELS, channels);
}

export function writeWatchedCache(ids: string[]): void {
    writeLS(LS_WATCHED, ids);
}

export function writeSettingsCache(settings: AppSettings): void {
    writeLS(LS_SETTINGS, settings);
}

export async function fetchChannels(): Promise<YouTubeChannel[]> {
    const res = await fetch("/api/channels", { cache: "no-store" });
    if (!res.ok) throw new Error(`GET /api/channels failed: ${res.status}`);
    return res.json();
}

export async function fetchWatched(): Promise<string[]> {
    const res = await fetch("/api/watched", { cache: "no-store" });
    if (!res.ok) throw new Error(`GET /api/watched failed: ${res.status}`);
    return res.json();
}

export async function fetchSettings(): Promise<AppSettings> {
    const res = await fetch("/api/settings", { cache: "no-store" });
    if (!res.ok) throw new Error(`GET /api/settings failed: ${res.status}`);
    return res.json();
}

export async function putChannels(channels: YouTubeChannel[]): Promise<YouTubeChannel[]> {
    const res = await fetch("/api/channels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(channels),
    });
    if (!res.ok) throw new Error(`PUT /api/channels failed: ${res.status}`);
    return res.json();
}

export async function putWatched(ids: string[]): Promise<string[]> {
    const res = await fetch("/api/watched", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids),
    });
    if (!res.ok) throw new Error(`PUT /api/watched failed: ${res.status}`);
    return res.json();
}

export async function putSettings(settings: AppSettings): Promise<AppSettings> {
    const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error(`PUT /api/settings failed: ${res.status}`);
    return res.json();
}

export async function upsertChannel(channel: YouTubeChannel): Promise<void> {
    const { channelId, ...rest } = channel;
    const res = await fetch(`/api/channels/${encodeURIComponent(channelId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rest),
    });
    if (!res.ok) throw new Error(`POST /api/channels/${channelId} failed: ${res.status}`);
}

export async function deleteChannel(channelId: string): Promise<void> {
    const res = await fetch(`/api/channels/${encodeURIComponent(channelId)}`, {
        method: "DELETE",
    });
    if (!res.ok) throw new Error(`DELETE /api/channels/${channelId} failed: ${res.status}`);
}

export async function postWatched(videoId: string): Promise<void> {
    const res = await fetch(`/api/watched/${encodeURIComponent(videoId)}`, {
        method: "POST",
    });
    if (!res.ok) throw new Error(`POST /api/watched/${videoId} failed: ${res.status}`);
}

export async function deleteWatched(videoId: string): Promise<void> {
    const res = await fetch(`/api/watched/${encodeURIComponent(videoId)}`, {
        method: "DELETE",
    });
    if (!res.ok) throw new Error(`DELETE /api/watched/${videoId} failed: ${res.status}`);
}
