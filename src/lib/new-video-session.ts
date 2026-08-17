import type { YouTubeVideo } from "@/types/youtube";

export function createNewVideoSession(
    videos: YouTubeVideo[],
    selectedVideoId: string
): YouTubeVideo[] {
    const startIndex = videos.findIndex((video) => video.id === selectedVideoId);
    if (startIndex < 0) return [];
    return [...videos.slice(startIndex), ...videos.slice(0, startIndex)];
}
export function advanceNewVideoSession(
    session: YouTubeVideo[],
    currentVideoId: string
): YouTubeVideo[] {
    const currentIndex = session.findIndex((video) => video.id === currentVideoId);
    if (currentIndex < 0) return session;
    return [...session.slice(currentIndex + 1), ...session.slice(0, currentIndex)];
}
