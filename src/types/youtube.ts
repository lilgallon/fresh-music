export interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  publishedAt: string;
  channelId?: string;
  durationSeconds?: number | null;
  isShort?: boolean | null;
  liveStatus?: "live" | "upcoming" | "none" | null;
  watchedAt?: string | null;
  unavailable?: boolean;
}

export interface YouTubeChannel {
  channelId: string;
  name: string;
  isMusicOnly: boolean;
  thumbnail?: string;
  description?: string;
  uploadsPlaylistId?: string;
  lastDiscoveredVideoId?: string;
  lastDiscoveryAt?: string;
}
