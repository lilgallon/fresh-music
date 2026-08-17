import { describe, expect, it } from "vitest";
import { getVideoTitleFilterMatch, getVideoTitleRegexError } from "./video-title-filter";

describe("video title filters", () => {
    it("matches case-insensitive plain fragments", () => {
        expect(getVideoTitleFilterMatch("New Album TEASER", {
            excludedTitleTerms: ["trailer", "teaser"],
            excludedTitleRegexEnabled: false,
        })).toEqual({ value: "teaser", isRegex: false });
    });

    it("treats regex mode as one case-insensitive expression", () => {
        const rules = {
            excludedTitleTerms: ["^(artist).*(official audio|live session)$"],
            excludedTitleRegexEnabled: true,
        };

        expect(getVideoTitleFilterMatch("ARTIST - Official Audio", rules)).toEqual({
            value: "^(artist).*(official audio|live session)$",
            isRegex: true,
        });
        expect(getVideoTitleFilterMatch("Other artist - Official Audio", rules)).toBeNull();
    });

    it("reports invalid syntax while runtime matching fails open", () => {
        expect(getVideoTitleRegexError("[")).toBe(
            "The ignored title regular expression is invalid."
        );
        expect(getVideoTitleFilterMatch("Anything", {
            excludedTitleTerms: ["["],
            excludedTitleRegexEnabled: true,
        })).toBeNull();
    });
});
