import { YouTubeVideo, YouTubeChannel } from "@/types/youtube";

const API_KEY = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
const BASE_URL = "https://www.googleapis.com/youtube/v3";

export async function fetchLatestVideos(channelId: string, limit: number = 5): Promise<YouTubeVideo[]> {
    if (!API_KEY) {
        console.error("YouTube API Key is missing");
        return [];
    }

    try {
        // 1. Get the uploads playlist ID (replace 'UC' with 'UU' in channel ID)
        // Most channels follow this pattern: UC... -> UU...
        const uploadsPlaylistId = channelId.startsWith("UC")
            ? "UU" + channelId.substring(2)
            : channelId;

        // 2. Fetch latest videos from the playlist
        const response = await fetch(
            `${BASE_URL}/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=${limit}&key=${API_KEY}`
        );

        if (!response.ok) {
            // Silently attempt fallback to get the correct uploads playlist ID
            try {
                const channelResponse = await fetch(
                    `${BASE_URL}/channels?part=contentDetails&id=${channelId}&key=${API_KEY}`
                );

                if (channelResponse.ok) {
                    const channelData = await channelResponse.json();
                    const realUploadsId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

                    if (realUploadsId) {
                        const retryResponse = await fetch(
                            `${BASE_URL}/playlistItems?part=snippet&playlistId=${realUploadsId}&maxResults=${limit}&key=${API_KEY}`
                        );
                        if (retryResponse.ok) {
                            const retryData = await retryResponse.json();
                            return mapPlaylistItems(retryData.items);
                        }
                    }
                }
            } catch (e) {
                // Ignore fallback errors
            }

            return []; // Return empty instead of throwing to keep the UI stable
        }

        const data = await response.json();
        return mapPlaylistItems(data.items);
    } catch (error) {
        console.error(`Error fetching videos for channel ${channelId}:`, error);
        return [];
    }
}

function mapPlaylistItems(items: any[]): YouTubeVideo[] {
    interface PlaylistSnippet {
        resourceId: { videoId: string };
        title: string;
        thumbnails: {
            high?: { url: string };
            default?: { url: string };
        };
        channelTitle: string;
        publishedAt: string;
    }

    return (items || []).map((item: { snippet: PlaylistSnippet }) => ({
        id: item.snippet.resourceId.videoId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url || "",
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
    }));
}

export async function fetchAllVideos(channels: { channelId: string }[]): Promise<YouTubeVideo[]> {
    const allVideosPromises = channels.map((channel) => fetchLatestVideos(channel.channelId));
    const results = await Promise.all(allVideosPromises);

    // Flatten, sort by date (newest first), and return
    return results
        .flat()
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

export interface SearchResultChannel {
    id: string;
    title: string;
    description: string;
    thumbnail: string;
}

export async function searchChannels(query: string): Promise<SearchResultChannel[]> {
    if (!API_KEY) {
        console.error("YouTube API Key is missing");
        return [];
    }

    try {
        const response = await fetch(
            `${BASE_URL}/search?part=snippet&q=${encodeURIComponent(query)}&type=channel&maxResults=5&key=${API_KEY}`
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || "Failed to search channels");
        }

        const data = await response.json();

        return data.items.map((item: any) => ({
            id: item.snippet.channelId,
            title: item.snippet.title,
            description: item.snippet.description,
            thumbnail: item.snippet.thumbnails.default?.url || item.snippet.thumbnails.medium?.url,
        }));
    } catch (error) {
        console.error(`Error searching channels for query ${query}:`, error);
        return [];
    }
}

export async function fetchChannelsInfo(channelIds: string[]): Promise<Partial<YouTubeChannel>[]> {
    if (!API_KEY || channelIds.length === 0) return [];

    try {
        const response = await fetch(
            `${BASE_URL}/channels?part=snippet,contentDetails&id=${channelIds.join(",")}&key=${API_KEY}`
        );

        if (!response.ok) return [];

        const data = await response.json();
        return (data.items || []).map((item: any) => ({
            channelId: item.id,
            name: item.snippet.title,
            thumbnail: item.snippet.thumbnails.default?.url || item.snippet.thumbnails.medium?.url,
            description: item.snippet.description,
        }));
    } catch (error) {
        console.error("Error fetching channels info:", error);
        return [];
    }
}
