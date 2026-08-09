import { describe, expect, it, vi } from "vitest";
import {
    findIgnoredYouTubeVideoIds,
    isYouTubeShort,
    parseIsoDurationSeconds,
    YouTubeVideoMetadata,
} from "./youtube-content-filter";

function metadata(
    id: string,
    overrides: Partial<YouTubeVideoMetadata> = {}
): YouTubeVideoMetadata {
    return {
        id,
        title: id,
        durationSeconds: 240,
        liveBroadcastContent: "none",
        hasLiveStreamingDetails: false,
        ...overrides,
    };
}

describe("YouTube content filtering", () => {
    it("parses ISO durations", () => {
        expect(parseIsoDurationSeconds("PT2M31S")).toBe(151);
        expect(parseIsoDurationSeconds("PT1H2M3S")).toBe(3723);
        expect(parseIsoDurationSeconds("invalid")).toBeNull();
    });

    it("excludes current, upcoming, and completed live broadcasts", async () => {
        const checkShort = vi.fn().mockResolvedValue(false);

        const ignored = await findIgnoredYouTubeVideoIds([
            metadata("current", { liveBroadcastContent: "live" }),
            metadata("upcoming", { liveBroadcastContent: "upcoming" }),
            metadata("completed", { hasLiveStreamingDetails: true }),
            metadata("regular"),
        ], undefined, checkShort);

        expect(Array.from(ignored)).toEqual(["current", "upcoming", "completed"]);
        expect(checkShort).not.toHaveBeenCalled();
    });

    it("checks only videos up to three minutes and excludes confirmed Shorts", async () => {
        const checkShort = vi.fn(async (id: string) => id === "short");

        const ignored = await findIgnoredYouTubeVideoIds([
            metadata("short", { durationSeconds: 180 }),
            metadata("brief-regular", { durationSeconds: 59 }),
            metadata("long", { durationSeconds: 181 }),
            metadata("unknown", { durationSeconds: null }),
        ], undefined, checkShort);

        expect(Array.from(ignored)).toEqual(["short"]);
        expect(checkShort).toHaveBeenCalledTimes(2);
        expect(checkShort).toHaveBeenCalledWith("short");
        expect(checkShort).toHaveBeenCalledWith("brief-regular");
    });

    it("applies title and duration rules before checking Shorts", async () => {
        const checkShort = vi.fn().mockResolvedValue(false);

        const ignored = await findIgnoredYouTubeVideoIds([
            metadata("teaser", { title: "New album TEASER", durationSeconds: 120 }),
            metadata("too-short", { durationSeconds: 29 }),
            metadata("too-long", { durationSeconds: 601 }),
            metadata("accepted", { durationSeconds: 180 }),
        ], {
            excludedTitleTerms: ["teaser"],
            minimumDurationSeconds: 30,
            maximumDurationSeconds: 600,
        }, checkShort);

        expect(Array.from(ignored)).toEqual(["teaser", "too-short", "too-long"]);
        expect(checkShort).toHaveBeenCalledOnce();
        expect(checkShort).toHaveBeenCalledWith("accepted");
    });

    it("bypasses the EU consent redirect when checking the Shorts route", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ status: 200 });
        vi.stubGlobal("fetch", fetchMock);

        await expect(isYouTubeShort("Hkawe7QoQ1w")).resolves.toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(
            "https://www.youtube.com/shorts/Hkawe7QoQ1w",
            expect.objectContaining({
                method: "HEAD",
                redirect: "manual",
                headers: { Cookie: "SOCS=CAI" },
            })
        );

        vi.unstubAllGlobals();
    });
});
