import { YouTubeChannel } from "@/types/youtube";
import { YouTubeVideo } from "@/types/youtube";
import { YouTubeIntegrationPublicStatus } from "@/types/youtube-integration";
import { AppSettings, DEFAULT_SETTINGS } from "@/types/settings";
import type { YouTubeLikeResult, YouTubeRating } from "@/types/youtube-rating";
import type {
    ChannelStatisticsResponse,
    YouTubeRatingSyncResult,
} from "@/types/channel-statistics";

export type { AppSettings } from "@/types/settings";
export { DEFAULT_SETTINGS } from "@/types/settings";

const LS_CHANNELS = "followedChannels";
const LS_WATCHED = "watchedVideoIds";
const LS_SETTINGS = "freshMusicSettings";

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
    const cached = readLS<Partial<AppSettings>>(LS_SETTINGS);
    if (!cached) return null;
    return {
        ...DEFAULT_SETTINGS,
        ...cached,
        excludedTitleTerms: Array.isArray(cached.excludedTitleTerms)
            ? cached.excludedTitleTerms.filter((term): term is string => typeof term === "string")
            : [],
        excludedTitleRegexEnabled: cached.excludedTitleRegexEnabled === true,
    };
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

export async function bootstrapApplicationCache(params: {
    channels: YouTubeChannel[] | null;
    watchedIds: string[] | null;
    settings: AppSettings | null;
}): Promise<{ channels: YouTubeChannel[]; watchedIds: string[]; settings: AppSettings }> {
    const res = await fetch("/api/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`POST /api/bootstrap failed: ${res.status}`);
    return res.json();
}

export async function fetchCatalogVideos(
    tab: "new" | "history",
    cursor: string | null = null,
    limit = 50
): Promise<{ videos: YouTubeVideo[]; nextCursor: string | null; newCount: number }> {
    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const res = await fetch(`/api/videos?tab=${tab}&limit=${limit}${cursorParam}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`GET /api/videos failed: ${res.status}`);
    return res.json();
}

export async function fetchChannelStatistics(): Promise<ChannelStatisticsResponse> {
    const res = await fetch("/api/statistics/channels", { cache: "no-store" });
    if (!res.ok) throw new Error(`GET /api/statistics/channels failed: ${res.status}`);
    return res.json();
}

export async function syncYouTubeRatings(force = false): Promise<YouTubeRatingSyncResult> {
    const res = await fetch("/api/youtube/ratings/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
    });
    const body = await res.json().catch(() => ({})) as YouTubeRatingSyncResult & { error?: string };
    if (!res.ok) throw new Error(body.error ?? `Could not synchronize YouTube ratings (${res.status})`);
    return body;
}

export interface SearchResultChannel {
    id: string;
    title: string;
    description: string;
    thumbnail: string;
}

export async function searchChannels(query: string): Promise<SearchResultChannel[]> {
    const res = await fetch(`/api/youtube/channels/search?q=${encodeURIComponent(query)}`, {
        cache: "no-store",
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Channel search failed: ${res.status}`);
    }
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
    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `PUT /api/settings failed: ${res.status}`);
    }
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

export async function likeYouTubeVideo(videoId: string): Promise<YouTubeLikeResult> {
    const res = await fetch(`/api/youtube/videos/${encodeURIComponent(videoId)}/like`, {
        method: "POST",
    });
    const body = await res.json().catch(() => ({})) as YouTubeLikeResult & { error?: string };
    if (!res.ok) throw new Error(body.error ?? `Could not like the YouTube video (${res.status})`);
    return body;
}

export async function undoYouTubeVideoLike(
    videoId: string,
    previousRating: YouTubeRating
): Promise<void> {
    const res = await fetch(`/api/youtube/videos/${encodeURIComponent(videoId)}/like/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previousRating }),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Could not undo the YouTube like (${res.status})`);
    }
}

export async function fetchYouTubeIntegration(): Promise<YouTubeIntegrationPublicStatus> {
    const res = await fetch("/api/youtube/connection", { cache: "no-store" });
    if (!res.ok) throw new Error(`GET /api/youtube/connection failed: ${res.status}`);
    return res.json();
}

export async function syncYouTubePlaylist(): Promise<YouTubeIntegrationPublicStatus> {
    const res = await fetch("/api/youtube/sync", { method: "POST" });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `POST /api/youtube/sync failed: ${res.status}`);
    return fetchYouTubeIntegration();
}

export async function recreateYouTubePlaylist(): Promise<YouTubeIntegrationPublicStatus> {
    const res = await fetch("/api/youtube/playlist", { method: "POST" });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `POST /api/youtube/playlist failed: ${res.status}`);
    return body;
}

export async function adoptExistingYouTubePlaylist(): Promise<YouTubeIntegrationPublicStatus> {
    const res = await fetch("/api/youtube/playlist/adopt", { method: "POST" });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `POST /api/youtube/playlist/adopt failed: ${res.status}`);
    return body;
}

export async function disconnectYouTube(): Promise<YouTubeIntegrationPublicStatus> {
    const res = await fetch("/api/youtube/connection", { method: "DELETE" });
    if (!res.ok) throw new Error(`DELETE /api/youtube/connection failed: ${res.status}`);
    return res.json();
}
