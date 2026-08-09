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

export async function findExistingFreshMusicPlaylist(
    youtube: Pick<YouTubeGateway, "getPlaylist" | "findPrivatePlaylistByTitle">,
    accessToken: string,
    title: string,
    preferredPlaylistId?: string | null
): Promise<PlaylistResolution | null> {
    if (preferredPlaylistId) {
        const preferred = await youtube.getPlaylist(accessToken, preferredPlaylistId);
        if (preferred) return { playlist: preferred, source: "preferred" };
    }

    const existing = await youtube.findPrivatePlaylistByTitle(accessToken, title);
    return existing ? { playlist: existing, source: "existing" } : null;
}

export async function resolveFreshMusicPlaylist(
    youtube: PlaylistResolverGateway,
    accessToken: string,
    title: string,
    preferredPlaylistId?: string | null
): Promise<PlaylistResolution> {
    const existing = await findExistingFreshMusicPlaylist(
        youtube,
        accessToken,
        title,
        preferredPlaylistId
    );
    if (existing) return existing;

    return {
        playlist: await youtube.createPrivatePlaylist(accessToken),
        source: "created",
    };
}
