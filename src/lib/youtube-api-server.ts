import "server-only";

import { YouTubeChannel, YouTubeVideo } from "@/types/youtube";
import type { YouTubeContentFilterRules } from "./youtube-content-filter";
import {
    isApplicationInitialized,
    listCatalogFilterReasons,
    listEligibleUnwatchedCatalogVideos,
} from "./catalog-repository";
import {
    canUseYouTubeRead,
    pauseYouTubeQuota,
    recordYouTubeRead,
    reserveYouTubeWrite,
} from "./youtube-quota";
import { getSettings } from "./repository";
import { isYouTubeQuotaExceededError } from "./youtube-quota-error";
import type { YouTubeRating } from "@/types/youtube-rating";

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

export class YouTubeWriteBudgetError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "YouTubeWriteBudgetError";
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
    const method = init?.method?.toUpperCase() ?? "GET";
    if (method === "GET") {
        if (!canUseYouTubeRead()) {
            throw new Error("The configured YouTube quota is exhausted or paused.");
        }
        recordYouTubeRead(1);
    } else {
        if (!isApplicationInitialized()) {
            throw new Error("Fresh Music must finish its local bootstrap before writing to YouTube.");
        }
        const reservation = reserveYouTubeWrite(50);
        if (!reservation.allowed) throw new YouTubeWriteBudgetError(reservation.reason ?? "YouTube write budget exhausted");
    }
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
        const reason = data.error?.errors?.[0]?.reason ?? null;
        const message = data.error?.message || `YouTube API request failed with ${response.status}`;
        if (isYouTubeQuotaExceededError(response.status, reason, message)) pauseYouTubeQuota();
        throw new YouTubeApiError(
            message,
            response.status,
            reason
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

export interface FilteredYouTubeVideo {
    videoId: string;
    reason: string;
}

export interface YouTubeGateway {
    getMyAccount(accessToken: string): Promise<YouTubeAccount>;
    getPlaylist(accessToken: string, playlistId: string): Promise<YouTubePlaylist | null>;
    findPrivatePlaylistByTitle(accessToken: string, title: string): Promise<YouTubePlaylist | null>;
    createPrivatePlaylist(accessToken: string): Promise<YouTubePlaylist>;
    listPlaylistItems(accessToken: string, playlistId: string): Promise<YouTubeRemotePlaylistItem[]>;
    insertPlaylistItem(accessToken: string, playlistId: string, videoId: string): Promise<string>;
    deletePlaylistItem(accessToken: string, playlistItemId: string): Promise<void>;
    findIgnoredVideos(
        accessToken: string,
        videoIds: string[],
        rules?: YouTubeContentFilterRules
    ): Promise<FilteredYouTubeVideo[]>;
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

interface VideoRatingResponse {
    items?: Array<{
        videoId?: string;
        rating?: "like" | "dislike" | "none" | "unspecified";
    }>;
}

export interface YouTubeRatingGateway {
    getRating(accessToken: string, videoId: string): Promise<YouTubeRating>;
    setRating(accessToken: string, videoId: string, rating: YouTubeRating): Promise<void>;
}

export const youtubeRatingGateway: YouTubeRatingGateway = {
    async getRating(accessToken, videoId) {
        const data = await authorizedRequest<VideoRatingResponse>(
            accessToken,
            `/videos/getRating?id=${encodeURIComponent(videoId)}`
        );
        const rating = data.items?.find((item) => item.videoId === videoId)?.rating;
        return rating === "like" || rating === "dislike" ? rating : "none";
    },

    async setRating(accessToken, videoId, rating) {
        await authorizedRequest<void>(
            accessToken,
            `/videos/rate?id=${encodeURIComponent(videoId)}&rating=${encodeURIComponent(rating)}`,
            { method: "POST" }
        );
    },
};

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

    async findIgnoredVideos(_accessToken, videoIds, rules) {
        return Array.from(listCatalogFilterReasons(videoIds, {
            ...getSettings(),
            excludedTitleTerms: rules?.excludedTitleTerms ?? [],
            minimumDurationSeconds: rules?.minimumDurationSeconds ?? null,
            maximumDurationSeconds: rules?.maximumDurationSeconds ?? null,
        })).map(([videoId, reason]) => ({ videoId, reason }));
    },

    async discoverVideos() {
        return listEligibleUnwatchedCatalogVideos(getSettings()).map((video) => ({
            ...video,
            sourceChannelId: video.channelId ?? "",
        }));
    },
};
