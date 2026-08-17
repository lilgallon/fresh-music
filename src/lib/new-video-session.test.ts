import { describe, expect, it } from "vitest";
import type { YouTubeVideo } from "@/types/youtube";
import { advanceNewVideoSession, createNewVideoSession } from "./new-video-session";

function video(id: string): YouTubeVideo {
    return {
        id,
        title: id,
        thumbnail: "",
        channelTitle: "Channel",
        publishedAt: "2026-08-17T00:00:00.000Z",
    };
}

describe("New video session", () => {
    const videos = [video("a"), video("b"), video("c"), video("d")];

    it("starts with the selected grid video and visits every loaded video once", () => {
        expect(createNewVideoSession(videos, "c").map(({ id }) => id)).toEqual(["c", "d", "a", "b"]);
    });

    it("removes the current video and keeps the remaining session order", () => {
        const session = createNewVideoSession(videos, "c");
        expect(advanceNewVideoSession(session, "c").map(({ id }) => id)).toEqual(["d", "a", "b"]);
    });

    it("closes the session after its final video", () => {
        expect(advanceNewVideoSession([videos[0]], "a")).toEqual([]);
    });

    it("does not invent a session for a video outside the loaded catalogue", () => {
        expect(createNewVideoSession(videos, "missing")).toEqual([]);
    });
});
