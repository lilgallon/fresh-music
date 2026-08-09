import { describe, expect, it } from "vitest";
import { getYouTubeQuotaDay, nextYouTubeQuotaReset } from "./youtube-quota-time";

describe("YouTube quota calendar", () => {
    it("uses the Pacific date independently of the server timezone", () => {
        expect(getYouTubeQuotaDay(Date.parse("2026-08-10T06:30:00Z"))).toBe("2026-08-09");
        expect(getYouTubeQuotaDay(Date.parse("2026-08-10T07:30:00Z"))).toBe("2026-08-10");
    });

    it("finds the next midnight Pacific during daylight saving time", () => {
        const reset = nextYouTubeQuotaReset(Date.parse("2026-08-09T20:00:00Z"));
        expect(new Date(reset).toISOString()).toBe("2026-08-10T07:00:00.000Z");
    });

    it("finds the next midnight Pacific during standard time", () => {
        const reset = nextYouTubeQuotaReset(Date.parse("2026-12-09T20:00:00Z"));
        expect(new Date(reset).toISOString()).toBe("2026-12-10T08:00:00.000Z");
    });
});
