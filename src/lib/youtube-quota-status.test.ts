import { describe, expect, it } from "vitest";
import { isYouTubeQuotaExhausted } from "./youtube-quota-status";

const quota = {
    day: "2026-08-10",
    totalLimit: 10_000,
    writeLimit: 5_000,
    readUnits: 120,
    writeUnits: 50,
    searchCalls: 0,
    estimatedTotalUnits: 170,
    remainingMutations: 99,
    resetAt: "2026-08-11T07:00:00.000Z",
    pausedUntil: null,
};

describe("YouTube quota status", () => {
    it("reports quota exhaustion when the estimate reaches the configured limit", () => {
        expect(isYouTubeQuotaExhausted({ ...quota, estimatedTotalUnits: 10_000 })).toBe(true);
    });

    it("reports a server-enforced quota pause even if the estimate was incomplete", () => {
        expect(isYouTubeQuotaExhausted({ ...quota, pausedUntil: quota.resetAt })).toBe(true);
    });

    it("keeps the dashboard quiet while quota remains available", () => {
        expect(isYouTubeQuotaExhausted(quota)).toBe(false);
    });
});
