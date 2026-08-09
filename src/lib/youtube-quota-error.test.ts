import { describe, expect, it } from "vitest";
import { isYouTubeQuotaExceededError, readUnitsAtQuotaExhaustion } from "./youtube-quota-error";

describe("isYouTubeQuotaExceededError", () => {
    it("recognizes the documented YouTube quota reasons", () => {
        expect(isYouTubeQuotaExceededError(403, "quotaExceeded", "Forbidden")).toBe(true);
        expect(isYouTubeQuotaExceededError(403, "dailyLimitExceeded", "Forbidden")).toBe(true);
    });

    it("recognizes a 403 quota message even when Google omits the reason", () => {
        expect(isYouTubeQuotaExceededError(
            403,
            null,
            "The request cannot be completed because you have exceeded your quota."
        )).toBe(true);
    });

    it("does not classify unrelated forbidden responses as quota exhaustion", () => {
        expect(isYouTubeQuotaExceededError(403, "forbidden", "Access denied")).toBe(false);
    });

    it("forces estimated reads plus writes to the configured total", () => {
        expect(readUnitsAtQuotaExhaustion(10_000, 2_500)).toBe(7_500);
    });
});
