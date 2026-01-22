import { YouTubeVideo } from "@/types/youtube";

const API_KEY = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
const BASE_URL = "https://www.googleapis.com/youtube/v3";

export async function fetchLatestVideos(channelId: string, limit: number = 5): Promise<YouTubeVideo[]> {
    if (!API_KEY) {
        console.error("YouTube API Key is missing");
        return [];
    }

    try {
        // 1. Get the uploads playlist ID (replace 'UC' with 'UU' in channel ID)
        const uploadsPlaylistId = channelId.replace(/^UC/, "UU");

        // 2. Fetch latest videos from the playlist
        const response = await fetch(
            `${BASE_URL}/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=${limit}&key=${API_KEY}`
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || "Failed to fetch videos");
        }

        const data = await response.json();

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

        return data.items.map((item: { snippet: PlaylistSnippet }) => ({
            id: item.snippet.resourceId.videoId,
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
            channelTitle: item.snippet.channelTitle,
            publishedAt: item.snippet.publishedAt,
        }));
    } catch (error) {
        console.error(`Error fetching videos for channel ${channelId}:`, error);
        return [];
    }
}

export async function fetchAllVideos(channels: { channelId: string }[]): Promise<YouTubeVideo[]> {
    const allVideosPromises = channels.map((channel) => fetchLatestVideos(channel.channelId));
    const results = await Promise.all(allVideosPromises);

    // Flatten, sort by date (newest first), and return
    return results
        .flat()
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}
