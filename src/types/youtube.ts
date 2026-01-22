export interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  publishedAt: string;
}

export interface YouTubeChannel {
  channelId: string;
  name: string;
  isMusicOnly: boolean;
  thumbnail?: string;
  description?: string;
}
