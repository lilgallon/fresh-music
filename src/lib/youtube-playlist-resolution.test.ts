import { describe, expect, it, vi } from "vitest";
import {
    findExistingFreshMusicPlaylist,
    resolveFreshMusicPlaylist,
} from "./youtube-playlist-resolution";

const title = "Fresh Music — Nouveautés";

function gateway(params: {
    preferred?: { id: string; title: string } | null;
    existing?: { id: string; title: string } | null;
}) {
    return {
        getPlaylist: vi.fn().mockResolvedValue(params.preferred ?? null),
        findPrivatePlaylistByTitle: vi.fn().mockResolvedValue(params.existing ?? null),
        createPrivatePlaylist: vi.fn().mockResolvedValue({ id: "created", title }),
    };
}

describe("Fresh Music playlist resolution", () => {
    it("keeps the stored playlist when it still exists", async () => {
        const youtube = gateway({ preferred: { id: "stored", title } });

        const result = await resolveFreshMusicPlaylist(youtube, "token", title, "stored");

        expect(result).toEqual({ playlist: { id: "stored", title }, source: "preferred" });
        expect(youtube.findPrivatePlaylistByTitle).not.toHaveBeenCalled();
        expect(youtube.createPrivatePlaylist).not.toHaveBeenCalled();
    });

    it("adopts an existing named playlist instead of creating a duplicate", async () => {
        const youtube = gateway({
            preferred: null,
            existing: { id: "existing", title },
        });

        const result = await resolveFreshMusicPlaylist(youtube, "token", title, "missing");

        expect(result).toEqual({ playlist: { id: "existing", title }, source: "existing" });
        expect(youtube.createPrivatePlaylist).not.toHaveBeenCalled();
    });

    it("creates a playlist only when neither the stored nor a named playlist exists", async () => {
        const youtube = gateway({ preferred: null, existing: null });

        const result = await resolveFreshMusicPlaylist(youtube, "token", title, null);

        expect(result).toEqual({ playlist: { id: "created", title }, source: "created" });
        expect(youtube.createPrivatePlaylist).toHaveBeenCalledOnce();
    });

    it("can check for recovery without creating a missing playlist", async () => {
        const youtube = gateway({ preferred: null, existing: null });

        const result = await findExistingFreshMusicPlaylist(youtube, "token", title, "missing");

        expect(result).toBeNull();
        expect(youtube.createPrivatePlaylist).not.toHaveBeenCalled();
    });
});
