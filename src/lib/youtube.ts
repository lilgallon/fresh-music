import { YouTubeVideo, YouTubeChannel } from "@/types/youtube";
import type { YouTubeContentFilterRules } from "./youtube-content-filter";

const BASE_URL = "https://www.googleapis.com/youtube/v3";
let cachedApiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY || "";
let configPromise: Promise<string> | null = null;

async function getApiKey(): Promise<string> {
    if (cachedApiKey) return cachedApiKey;
    if (configPromise) return configPromise;

    configPromise = (async () => {
        try {
            const response = await fetch("/api/config");
            const data = await response.json();
            cachedApiKey = data.apiKey;
            return cachedApiKey;
        } catch {
            return "";
        } finally {
            configPromise = null;
        }
    })();

    return configPromise;
}

function getCutoffDate(lookbackDays: number): Date {
    const date = new Date();
    date.setDate(date.getDate() - lookbackDays);
    return date;
}

export async function fetchLatestVideos(
    channelId: string,
    lookbackDays: number = 30,
    filterRules?: YouTubeContentFilterRules,
    reportIssue?: (message: string) => void
): Promise<YouTubeVideo[]> {
    const apiKey = await getApiKey();
    if (!apiKey) {
        console.error("YouTube API Key is missing");
        reportIssue?.("The YouTube API key is missing.");
        return [];
    }

    try {
        const cutoffDate = getCutoffDate(lookbackDays);
        const maxResults = 50;

        // 1. Get the uploads playlist ID (replace 'UC' with 'UU' in channel ID)
        // Most channels follow this pattern: UC... -> UU...
        const uploadsPlaylistId = channelId.startsWith("UC")
            ? "UU" + channelId.substring(2)
            : channelId;

        // 2. Fetch latest videos from the playlist
        const response = await fetch(
            `${BASE_URL}/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=${maxResults}&key=${apiKey}`
        );

        if (!response.ok) {
            let failureResponse = response;
            // Silently attempt fallback to get the correct uploads playlist ID
            try {
                const channelResponse = await fetch(
                    `${BASE_URL}/channels?part=contentDetails&id=${channelId}&key=${apiKey}`
                );

                if (channelResponse.ok) {
                    const channelData = await channelResponse.json();
                    const realUploadsId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

                    if (realUploadsId) {
                        const retryResponse = await fetch(
                            `${BASE_URL}/playlistItems?part=snippet&playlistId=${realUploadsId}&maxResults=${maxResults}&key=${apiKey}`
                        );
                        if (retryResponse.ok) {
                            const retryData = await retryResponse.json();
                            return filterIgnoredContent(
                                filterVideosByDate(mapPlaylistItems(retryData.items), cutoffDate),
                                filterRules
                            );
                        }
                        failureResponse = retryResponse;
                    }
                } else {
                    failureResponse = channelResponse;
                }
            } catch {
                // Ignore fallback errors
            }

            reportIssue?.(await describeYouTubeApiFailure(failureResponse));
            return []; // Return empty instead of throwing to keep the UI stable
        }

        const data = await response.json();
        return filterIgnoredContent(
            filterVideosByDate(mapPlaylistItems(data.items), cutoffDate),
            filterRules
        );
    } catch (error) {
        console.error(`Error fetching videos for channel ${channelId}:`, error);
        reportIssue?.("YouTube could not be reached. Existing data was kept unchanged.");
        return [];
    }
}

async function describeYouTubeApiFailure(response: Response): Promise<string> {
    try {
        const data = await response.clone().json() as {
            error?: { message?: string; errors?: Array<{ reason?: string }> };
        };
        const reason = data.error?.errors?.[0]?.reason;
        if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
            return "The YouTube API quota is exhausted. Videos will return after Google resets the daily quota.";
        }
        if (reason === "keyInvalid") return "The configured YouTube API key is invalid.";
        return data.error?.message || `YouTube API request failed with status ${response.status}.`;
    } catch {
        return `YouTube API request failed with status ${response.status}.`;
    }
}

interface YouTubePlaylistItem {
    snippet: {
        resourceId: { videoId: string };
        title: string;
        thumbnails: {
            high?: { url: string };
            default?: { url: string };
        };
        channelTitle: string;
        publishedAt: string;
    };
}

function mapPlaylistItems(items: YouTubePlaylistItem[]): YouTubeVideo[] {
    return (items || []).map((item) => ({
        id: item.snippet.resourceId.videoId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url || "",
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
    }));
}

function filterVideosByDate(videos: YouTubeVideo[], cutoffDate: Date): YouTubeVideo[] {
    return videos.filter((video) => new Date(video.publishedAt) >= cutoffDate);
}

async function filterIgnoredContent(
    videos: YouTubeVideo[],
    rules?: YouTubeContentFilterRules
): Promise<YouTubeVideo[]> {
    if (videos.length === 0) return videos;

    try {
        const response = await fetch("/api/youtube/content-filter", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                videoIds: videos.map((video) => video.id),
                rules,
            }),
        });
        if (!response.ok) return videos;
        const data = await response.json() as { ignoredVideoIds?: string[] };
        const ignored = new Set(data.ignoredVideoIds ?? []);
        return videos.filter((video) => !ignored.has(video.id));
    } catch {
        return videos;
    }
}

export async function fetchAllVideos(
    channels: { channelId: string }[],
    lookbackDays: number = 30,
    filterRules?: YouTubeContentFilterRules
): Promise<{ videos: YouTubeVideo[]; error: string | null }> {
    const issues = new Set<string>();
    const allVideosPromises = channels.map((channel) =>
        fetchLatestVideos(
            channel.channelId,
            lookbackDays,
            filterRules,
            (message) => issues.add(message)
        )
    );
    const results = await Promise.all(allVideosPromises);

    // Flatten, sort by date (newest first), and return
    const videos = results
        .flat()
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    return { videos, error: issues.values().next().value ?? null };
}

export interface SearchResultChannel {
    id: string;
    title: string;
    description: string;
    thumbnail: string;
}

export async function searchChannels(query: string): Promise<SearchResultChannel[]> {
    const apiKey = await getApiKey();
    if (!apiKey) {
        console.error("YouTube API Key is missing");
        return [];
    }

    try {
        const response = await fetch(
            `${BASE_URL}/search?part=snippet&q=${encodeURIComponent(query)}&type=channel&maxResults=5&key=${apiKey}`
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || "Failed to search channels");
        }

        const data = await response.json();

        interface SearchItem {
            snippet: {
                channelId: string;
                title: string;
                description: string;
                thumbnails: {
                    default?: { url: string };
                    medium?: { url: string };
                };
            };
        }

        return (data.items || []).map((item: SearchItem) => ({
            id: item.snippet.channelId,
            title: item.snippet.title,
            description: item.snippet.description,
            thumbnail: item.snippet.thumbnails.default?.url || item.snippet.thumbnails.medium?.url || "",
        }));
    } catch (error) {
        console.error(`Error searching channels for query ${query}:`, error);
        return [];
    }
}

export async function fetchChannelsInfo(channelIds: string[]): Promise<Partial<YouTubeChannel>[]> {
    const apiKey = await getApiKey();
    if (!apiKey || channelIds.length === 0) return [];

    try {
        const response = await fetch(
            `${BASE_URL}/channels?part=snippet,contentDetails&id=${channelIds.join(",")}&key=${apiKey}`
        );

        if (!response.ok) return [];

        const data = await response.json();

        interface ChannelItem {
            id: string;
            snippet: {
                title: string;
                thumbnails: {
                    default?: { url: string };
                    medium?: { url: string };
                };
                description: string;
            };
        }

        return (data.items || []).map((item: ChannelItem) => ({
            channelId: item.id,
            name: item.snippet.title,
            thumbnail: item.snippet.thumbnails.default?.url || item.snippet.thumbnails.medium?.url || "",
            description: item.snippet.description,
        }));
    } catch (error) {
        console.error("Error fetching channels info:", error);
        return [];
    }
}
