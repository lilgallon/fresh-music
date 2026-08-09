import "server-only";

import { YouTubeChannel, YouTubeVideo } from "@/types/youtube";
import {
    findIgnoredYouTubeVideoIds,
    parseIsoDurationSeconds,
    YouTubeContentFilterRules,
    YouTubeVideoMetadata,
} from "./youtube-content-filter";
import { isYouTubeShortCached } from "./youtube-short-cache";

const BASE_URL = "https://www.googleapis.com/youtube/v3";
export const FRESH_MUSIC_PLAYLIST_TITLE = "Fresh Music — Nouveautés";

export class YouTubeApiError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly reason: string | null
    ) {
        super(message);
        this.name = "YouTubeApiError";
    }
}

interface YouTubeErrorResponse {
    error?: {
        message?: string;
        errors?: Array<{ reason?: string }>;
    };
}

async function authorizedRequest<T>(
    accessToken: string,
    path: string,
    init?: RequestInit
): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(init?.body ? { "Content-Type": "application/json" } : {}),
            ...init?.headers,
        },
        cache: "no-store",
    });

    if (!response.ok) {
        let data: YouTubeErrorResponse = {};
        try {
            data = await response.json() as YouTubeErrorResponse;
        } catch {
            // Keep the HTTP status as the diagnostic when Google returned no JSON body.
        }
        throw new YouTubeApiError(
            data.error?.message || `YouTube API request failed with ${response.status}`,
            response.status,
            data.error?.errors?.[0]?.reason ?? null
        );
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
}

export interface YouTubeAccount {
    channelId: string;
    title: string;
}

export interface YouTubePlaylist {
    id: string;
    title: string;
}

export interface YouTubeRemotePlaylistItem {
    id: string;
    videoId: string;
}

export interface DiscoveredYouTubeVideo extends YouTubeVideo {
    sourceChannelId: string;
}

export interface YouTubeGateway {
    getMyAccount(accessToken: string): Promise<YouTubeAccount>;
    getPlaylist(accessToken: string, playlistId: string): Promise<YouTubePlaylist | null>;
    findPrivatePlaylistByTitle(accessToken: string, title: string): Promise<YouTubePlaylist | null>;
    createPrivatePlaylist(accessToken: string): Promise<YouTubePlaylist>;
    listPlaylistItems(accessToken: string, playlistId: string): Promise<YouTubeRemotePlaylistItem[]>;
    insertPlaylistItem(accessToken: string, playlistId: string, videoId: string): Promise<string>;
    deletePlaylistItem(accessToken: string, playlistItemId: string): Promise<void>;
    findIgnoredVideoIds(
        accessToken: string,
        videoIds: string[],
        rules?: YouTubeContentFilterRules
    ): Promise<Set<string>>;
    discoverVideos(
        accessToken: string,
        channels: Array<Pick<YouTubeChannel, "channelId">>,
        lookbackDays: number,
        rules?: YouTubeContentFilterRules
    ): Promise<DiscoveredYouTubeVideo[]>;
}

interface ChannelsResponse {
    items?: Array<{
        id: string;
        snippet?: { title?: string };
        contentDetails?: { relatedPlaylists?: { uploads?: string } };
    }>;
}

interface PlaylistResponse {
    nextPageToken?: string;
    items?: Array<{
        id: string;
        snippet?: { title?: string; publishedAt?: string };
        status?: { privacyStatus?: string };
    }>;
}

interface PlaylistItemsResponse {
    nextPageToken?: string;
    items?: Array<{
        id: string;
        snippet?: {
            title?: string;
            channelTitle?: string;
            publishedAt?: string;
            resourceId?: { videoId?: string };
            thumbnails?: {
                high?: { url?: string };
                default?: { url?: string };
            };
        };
        contentDetails?: { videoId?: string; videoPublishedAt?: string };
    }>;
}

interface VideosResponse {
    items?: Array<{
        id: string;
        contentDetails?: { duration?: string };
        snippet?: {
            title?: string;
            liveBroadcastContent?: "live" | "upcoming" | "none";
        };
        liveStreamingDetails?: object;
    }>;
}

async function findIgnoredVideoIds(
    accessToken: string,
    videoIds: string[],
    rules?: YouTubeContentFilterRules
): Promise<Set<string>> {
    if (videoIds.length === 0) return new Set();

    try {
        const uniqueIds = Array.from(new Set(videoIds));
        const metadata: YouTubeVideoMetadata[] = [];
        for (let offset = 0; offset < uniqueIds.length; offset += 50) {
            const chunk = uniqueIds.slice(offset, offset + 50);
            const data = await authorizedRequest<VideosResponse>(
                accessToken,
                `/videos?part=contentDetails,snippet,liveStreamingDetails&id=${encodeURIComponent(chunk.join(","))}`
            );
            metadata.push(...(data.items ?? []).map((item) => ({
                id: item.id,
                title: item.snippet?.title ?? "",
                durationSeconds: item.contentDetails?.duration
                    ? parseIsoDurationSeconds(item.contentDetails.duration)
                    : null,
                liveBroadcastContent: item.snippet?.liveBroadcastContent ?? null,
                hasLiveStreamingDetails: item.liveStreamingDetails != null,
            })));
        }
        return findIgnoredYouTubeVideoIds(metadata, rules, isYouTubeShortCached);
    } catch (error) {
        console.warn("Could not identify Shorts or live videos; keeping the discovered list:", error);
        return new Set();
    }
}

async function filterIgnoredContent(
    accessToken: string,
    videos: DiscoveredYouTubeVideo[],
    rules?: YouTubeContentFilterRules
): Promise<DiscoveredYouTubeVideo[]> {
    const ignored = await findIgnoredVideoIds(accessToken, videos.map((video) => video.id), rules);
    return videos.filter((video) => !ignored.has(video.id));
}

async function getUploadsPlaylistId(accessToken: string, channelId: string): Promise<string | null> {
    const guessedId = channelId.startsWith("UC") ? `UU${channelId.slice(2)}` : channelId;
    try {
        await authorizedRequest<PlaylistItemsResponse>(
            accessToken,
            `/playlistItems?part=id&playlistId=${encodeURIComponent(guessedId)}&maxResults=1`
        );
        return guessedId;
    } catch {
        try {
            const data = await authorizedRequest<ChannelsResponse>(
                accessToken,
                `/channels?part=contentDetails&id=${encodeURIComponent(channelId)}`
            );
            return data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null;
        } catch {
            return null;
        }
    }
}

async function discoverChannelVideos(
    accessToken: string,
    channelId: string,
    lookbackDays: number,
    rules?: YouTubeContentFilterRules
): Promise<DiscoveredYouTubeVideo[]> {
    const playlistId = await getUploadsPlaylistId(accessToken, channelId);
    if (!playlistId) return [];

    try {
        const data = await authorizedRequest<PlaylistItemsResponse>(
            accessToken,
            `/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(playlistId)}&maxResults=50`
        );
        const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
        const videos = (data.items ?? []).flatMap((item): DiscoveredYouTubeVideo[] => {
            const videoId = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
            const publishedAt = item.contentDetails?.videoPublishedAt ?? item.snippet?.publishedAt;
            if (!videoId || !publishedAt || new Date(publishedAt).getTime() < cutoff) return [];
            return [{
                id: videoId,
                title: item.snippet?.title ?? "Untitled video",
                thumbnail: item.snippet?.thumbnails?.high?.url
                    ?? item.snippet?.thumbnails?.default?.url
                    ?? "",
                channelTitle: item.snippet?.channelTitle ?? "",
                publishedAt,
                sourceChannelId: channelId,
            }];
        });
        return filterIgnoredContent(accessToken, videos, rules);
    } catch (error) {
        console.warn(`Could not discover videos for channel ${channelId}:`, error);
        return [];
    }
}

export const youtubeGateway: YouTubeGateway = {
    async getMyAccount(accessToken) {
        const data = await authorizedRequest<ChannelsResponse>(
            accessToken,
            "/channels?part=snippet&mine=true"
        );
        const channel = data.items?.[0];
        if (!channel?.id) {
            throw new YouTubeApiError(
                "The connected Google account does not have a YouTube channel",
                400,
                "youtubeSignupRequired"
            );
        }
        return { channelId: channel.id, title: channel.snippet?.title ?? "YouTube" };
    },

    async getPlaylist(accessToken, playlistId) {
        const data = await authorizedRequest<PlaylistResponse>(
            accessToken,
            `/playlists?part=snippet&id=${encodeURIComponent(playlistId)}`
        );
        const playlist = data.items?.[0];
        return playlist ? { id: playlist.id, title: playlist.snippet?.title ?? FRESH_MUSIC_PLAYLIST_TITLE } : null;
    },

    async findPrivatePlaylistByTitle(accessToken, title) {
        const matches: Array<{ playlist: YouTubePlaylist; publishedAt: string }> = [];
        let pageToken: string | undefined;
        do {
            const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
            const data = await authorizedRequest<PlaylistResponse>(
                accessToken,
                `/playlists?part=snippet,status&mine=true&maxResults=50${tokenParam}`
            );
            for (const item of data.items ?? []) {
                if (
                    item.id
                    && item.snippet?.title === title
                    && item.status?.privacyStatus === "private"
                ) {
                    matches.push({
                        playlist: { id: item.id, title: item.snippet.title },
                        publishedAt: item.snippet.publishedAt ?? "",
                    });
                }
            }
            pageToken = data.nextPageToken;
        } while (pageToken);

        matches.sort((left, right) => left.publishedAt.localeCompare(right.publishedAt));
        return matches[0]?.playlist ?? null;
    },

    async createPrivatePlaylist(accessToken) {
        const data = await authorizedRequest<{ id: string; snippet?: { title?: string } }>(
            accessToken,
            "/playlists?part=snippet,status",
            {
                method: "POST",
                body: JSON.stringify({
                    snippet: {
                        title: FRESH_MUSIC_PLAYLIST_TITLE,
                        description: "Nouveautés ajoutées automatiquement par Fresh Music.",
                    },
                    status: { privacyStatus: "private" },
                }),
            }
        );
        return { id: data.id, title: data.snippet?.title ?? FRESH_MUSIC_PLAYLIST_TITLE };
    },

    async listPlaylistItems(accessToken, playlistId) {
        const items: YouTubeRemotePlaylistItem[] = [];
        let pageToken: string | undefined;
        do {
            const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
            const data = await authorizedRequest<PlaylistItemsResponse>(
                accessToken,
                `/playlistItems?part=contentDetails&playlistId=${encodeURIComponent(playlistId)}&maxResults=50${tokenParam}`
            );
            for (const item of data.items ?? []) {
                const videoId = item.contentDetails?.videoId;
                if (item.id && videoId) items.push({ id: item.id, videoId });
            }
            pageToken = data.nextPageToken;
        } while (pageToken);
        return items;
    },

    async insertPlaylistItem(accessToken, playlistId, videoId) {
        const data = await authorizedRequest<{ id: string }>(
            accessToken,
            "/playlistItems?part=snippet",
            {
                method: "POST",
                body: JSON.stringify({
                    snippet: {
                        playlistId,
                        resourceId: { kind: "youtube#video", videoId },
                    },
                }),
            }
        );
        return data.id;
    },

    async deletePlaylistItem(accessToken, playlistItemId) {
        await authorizedRequest<void>(
            accessToken,
            `/playlistItems?id=${encodeURIComponent(playlistItemId)}`,
            { method: "DELETE" }
        );
    },

    findIgnoredVideoIds,

    async discoverVideos(accessToken, channels, lookbackDays, rules) {
        const channelVideos = await Promise.all(
            channels.map((channel) => discoverChannelVideos(
                accessToken,
                channel.channelId,
                lookbackDays,
                rules
            ))
        );
        const byId = new Map<string, DiscoveredYouTubeVideo>();
        for (const video of channelVideos.flat()) byId.set(video.id, video);
        return Array.from(byId.values()).sort(
            (left, right) => new Date(left.publishedAt).getTime() - new Date(right.publishedAt).getTime()
        );
    },
};
