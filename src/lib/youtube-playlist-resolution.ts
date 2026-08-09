import type { YouTubeGateway, YouTubePlaylist } from "./youtube-api-server";

export type PlaylistResolutionSource = "preferred" | "existing" | "created";

export interface PlaylistResolution {
    playlist: YouTubePlaylist;
    source: PlaylistResolutionSource;
}

type PlaylistResolverGateway = Pick<
    YouTubeGateway,
    "getPlaylist" | "findPrivatePlaylistByTitle" | "createPrivatePlaylist"
>;

export async function resolveFreshMusicPlaylist(
    youtube: PlaylistResolverGateway,
    accessToken: string,
    title: string,
    preferredPlaylistId?: string | null
): Promise<PlaylistResolution> {
    if (preferredPlaylistId) {
        const preferred = await youtube.getPlaylist(accessToken, preferredPlaylistId);
        if (preferred) return { playlist: preferred, source: "preferred" };
    }

    const existing = await youtube.findPrivatePlaylistByTitle(accessToken, title);
    if (existing) return { playlist: existing, source: "existing" };

    return {
        playlist: await youtube.createPrivatePlaylist(accessToken),
        source: "created",
    };
}
