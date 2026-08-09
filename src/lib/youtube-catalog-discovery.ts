import "server-only";

import {
    ensureUnavailableCatalogVideos,
    isLegacyHistoryEnriched,
    listCatalogIdsNeedingMetadataRefresh,
    listChannelDiscoveryStates,
    listWatchedIdsMissingCatalog,
    markLegacyHistoryEnriched,
    upsertCatalogVideos,
    updateChannelDiscoveryState,
    type CatalogVideoInput,
} from "./catalog-repository";
import { getSettings } from "./repository";
import { isYouTubeShortCached } from "./youtube-short-cache";
import { parseIsoDurationSeconds, MAX_SHORT_DURATION_SECONDS } from "./youtube-content-filter";
import { updateSyncRun } from "./sync-run-repository";
import {
    canUseYouTubeRead,
    pauseYouTubeQuota,
    recordYouTubeRead,
    recordYouTubeSearch,
} from "./youtube-quota";
import { YouTubeApiError } from "./youtube-api-server";
import { isYouTubeQuotaExceededError } from "./youtube-quota-error";

const BASE_URL = "https://www.googleapis.com/youtube/v3";

interface ApiErrorResponse {
    error?: { message?: string; errors?: Array<{ reason?: string }> };
}

async function publicRequest<T>(path: string, reservedUnits = 0): Promise<T> {
    if (reservedUnits === 0 && !canUseYouTubeRead()) {
        throw new Error("The configured YouTube quota is exhausted or paused.");
    }
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) throw new Error("YOUTUBE_API_KEY is not configured");
    if (reservedUnits === 0) recordYouTubeRead();
    const response = await fetch(`${BASE_URL}${path}${path.includes("?") ? "&" : "?"}key=${encodeURIComponent(apiKey)}`, {
        cache: "no-store",
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({})) as ApiErrorResponse;
        const reason = data.error?.errors?.[0]?.reason ?? null;
        const message = data.error?.message ?? `YouTube API request failed with ${response.status}`;
        if (isYouTubeQuotaExceededError(response.status, reason, message)) pauseYouTubeQuota();
        throw new YouTubeApiError(
            message,
            response.status,
            reason
        );
    }
    return response.json() as Promise<T>;
}

interface PlaylistItemsResponse {
    nextPageToken?: string;
    items?: Array<{
        contentDetails?: { videoId?: string; videoPublishedAt?: string };
        snippet?: { publishedAt?: string; resourceId?: { videoId?: string } };
    }>;
}

interface ChannelsResponse {
    items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }>;
}

interface VideosResponse {
    items?: Array<{
        id: string;
        snippet?: {
            title?: string;
            channelId?: string;
            channelTitle?: string;
            publishedAt?: string;
            liveBroadcastContent?: "live" | "upcoming" | "none";
            thumbnails?: { high?: { url?: string }; medium?: { url?: string }; default?: { url?: string } };
        };
        contentDetails?: { duration?: string };
        liveStreamingDetails?: object;
    }>;
}

async function fetchVideoMetadata(videoIds: string[]): Promise<CatalogVideoInput[]> {
    if (videoIds.length === 0) return [];
    const data = await publicRequest<VideosResponse>(
        `/videos?part=snippet,contentDetails,liveStreamingDetails&id=${encodeURIComponent(videoIds.join(","))}`
    );
    return Promise.all((data.items ?? []).map(async (item): Promise<CatalogVideoInput> => {
        const durationSeconds = item.contentDetails?.duration
            ? parseIsoDurationSeconds(item.contentDetails.duration)
            : null;
        const isShort = durationSeconds != null && durationSeconds <= MAX_SHORT_DURATION_SECONDS
            ? await isYouTubeShortCached(item.id)
            : false;
        const rawLive = item.snippet?.liveBroadcastContent ?? "none";
        const liveStatus = rawLive === "live" || rawLive === "upcoming"
            ? rawLive
            : item.liveStreamingDetails != null ? "live" : "none";
        return {
            id: item.id,
            channelId: item.snippet?.channelId ?? null,
            title: item.snippet?.title ?? "Untitled video",
            channelTitle: item.snippet?.channelTitle ?? "",
            thumbnail: item.snippet?.thumbnails?.high?.url
                ?? item.snippet?.thumbnails?.medium?.url
                ?? item.snippet?.thumbnails?.default?.url
                ?? "",
            publishedAt: item.snippet?.publishedAt ?? null,
            durationSeconds,
            liveStatus,
            isShort,
        };
    }));
}

async function enrichIds(
    videoIds: string[],
    runId?: number,
    hints?: Map<string, { channelId: string; publishedAt: string | null }>
): Promise<number> {
    let catalogued = 0;
    for (let offset = 0; offset < videoIds.length; offset += 50) {
        const chunk = videoIds.slice(offset, offset + 50);
        const metadata = await fetchVideoMetadata(chunk);
        upsertCatalogVideos(metadata);
        const returned = new Set(metadata.map((video) => video.id));
        const unavailable = chunk.filter((id) => !returned.has(id));
        const unavailableWithHints = unavailable.filter((id) => hints?.has(id));
        if (unavailableWithHints.length > 0) {
            upsertCatalogVideos(unavailableWithHints.map((id) => ({
                id,
                channelId: hints?.get(id)?.channelId ?? null,
                title: "Unavailable video",
                channelTitle: "",
                thumbnail: "",
                publishedAt: hints?.get(id)?.publishedAt ?? null,
                durationSeconds: null,
                liveStatus: null,
                isShort: null,
                unavailable: true,
            })));
        }
        ensureUnavailableCatalogVideos(unavailable.filter((id) => !hints?.has(id)));
        catalogued += chunk.length;
        if (runId) updateSyncRun(runId, { catalogued });
    }
    return catalogued;
}

async function enrichLegacyHistory(runId?: number): Promise<number> {
    if (isLegacyHistoryEnriched()) return 0;
    if (runId) updateSyncRun(runId, { phase: "enriching_history" });
    let total = 0;
    while (true) {
        const missing = listWatchedIdsMissingCatalog(50);
        if (missing.length === 0) break;
        total += await enrichIds(missing, runId);
    }
    markLegacyHistoryEnriched();
    return total;
}

export interface CatalogDiscoveryResult {
    discovered: number;
    catalogued: number;
}

export async function discoverYouTubeCatalog(runId?: number): Promise<CatalogDiscoveryResult> {
    const settings = getSettings();
    const channels = listChannelDiscoveryStates();
    if (runId) updateSyncRun(runId, {
        phase: "discovering",
        channelsTotal: channels.length,
        channelsProcessed: 0,
    });

    let catalogued = await enrichLegacyHistory(runId);
    if (runId) updateSyncRun(runId, { phase: "discovering", catalogued });

    const cutoff = Date.now() - settings.videoLookbackDays * 24 * 60 * 60 * 1000;
    const discoveredIds: string[] = [];
    const discoveredHints = new Map<string, { channelId: string; publishedAt: string | null }>();
    const channelUpdates: Array<{
        channelId: string;
        uploadsPlaylistId: string;
        newestVideoId: string | null;
    }> = [];
    let processed = 0;

    for (const channel of channels) {
        let uploadsPlaylistId = channel.uploadsPlaylistId
            ?? (channel.channelId.startsWith("UC") ? `UU${channel.channelId.slice(2)}` : channel.channelId);
        let pageToken: string | undefined;
        let newestVideoId: string | null = null;
        let shouldStop = false;

        for (let page = 0; page < settings.maxDiscoveryPagesPerChannel && !shouldStop; page += 1) {
            const token = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
            let data: PlaylistItemsResponse;
            try {
                data = await publicRequest<PlaylistItemsResponse>(
                    `/playlistItems?part=contentDetails,snippet&playlistId=${encodeURIComponent(uploadsPlaylistId)}&maxResults=50${token}`
                );
            } catch (error) {
                if (page === 0 && !channel.uploadsPlaylistId && error instanceof YouTubeApiError && error.status === 404) {
                    const channelData = await publicRequest<ChannelsResponse>(
                        `/channels?part=contentDetails&id=${encodeURIComponent(channel.channelId)}`
                    );
                    const actual = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
                    if (!actual) throw error;
                    uploadsPlaylistId = actual;
                    data = await publicRequest<PlaylistItemsResponse>(
                        `/playlistItems?part=contentDetails,snippet&playlistId=${encodeURIComponent(actual)}&maxResults=50`
                    );
                } else {
                    throw error;
                }
            }

            for (const item of data.items ?? []) {
                const videoId = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
                const publishedAt = item.contentDetails?.videoPublishedAt ?? item.snippet?.publishedAt;
                if (!videoId) continue;
                if (!newestVideoId) newestVideoId = videoId;
                if (channel.lastDiscoveredVideoId && videoId === channel.lastDiscoveredVideoId) {
                    shouldStop = true;
                    break;
                }
                if (publishedAt && new Date(publishedAt).getTime() < cutoff) {
                    shouldStop = true;
                    break;
                }
                discoveredIds.push(videoId);
                discoveredHints.set(videoId, {
                    channelId: channel.channelId,
                    publishedAt: publishedAt ?? null,
                });
            }
            pageToken = data.nextPageToken;
            if (!pageToken) shouldStop = true;
        }

        channelUpdates.push({ channelId: channel.channelId, uploadsPlaylistId, newestVideoId });
        processed += 1;
        if (runId) updateSyncRun(runId, {
            channelsProcessed: processed,
            discovered: new Set(discoveredIds).size,
        });
    }

    const uniqueIds = Array.from(new Set(discoveredIds));
    catalogued += await enrichIds(uniqueIds, runId, discoveredHints);
    const newIds = new Set(uniqueIds);
    const staleIds = listCatalogIdsNeedingMetadataRefresh(settings)
        .filter((videoId) => !newIds.has(videoId));
    catalogued += await enrichIds(staleIds, runId);
    for (const update of channelUpdates) {
        updateChannelDiscoveryState(update.channelId, update.uploadsPlaylistId, update.newestVideoId);
    }
    return { discovered: uniqueIds.length, catalogued };
}

export interface ChannelSearchResult {
    id: string;
    title: string;
    description: string;
    thumbnail: string;
}

export async function searchYouTubeChannels(query: string): Promise<ChannelSearchResult[]> {
    if (!recordYouTubeSearch()) throw new Error("The daily YouTube channel search limit is exhausted.");
    const data = await publicRequest<{
        items?: Array<{ snippet?: {
            channelId?: string;
            title?: string;
            description?: string;
            thumbnails?: { default?: { url?: string }; medium?: { url?: string } };
        } }>;
    }>(`/search?part=snippet&q=${encodeURIComponent(query)}&type=channel&maxResults=5`, 100);
    return (data.items ?? []).flatMap((item) => item.snippet?.channelId ? [{
        id: item.snippet.channelId,
        title: item.snippet.title ?? "YouTube channel",
        description: item.snippet.description ?? "",
        thumbnail: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url ?? "",
    }] : []);
}
