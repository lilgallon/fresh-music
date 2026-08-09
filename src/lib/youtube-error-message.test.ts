import { describe, expect, it } from "vitest";
import { parseYouTubeErrorMessage } from "./youtube-error-message";

describe("parseYouTubeErrorMessage", () => {
    it("turns Google's relative quota anchor into a safe absolute link", () => {
        expect(parseYouTubeErrorMessage(
            'You exceeded your <a href="/youtube/v3/getting-started#quota">quota</a>.'
        )).toEqual([
            { type: "text", text: "You exceeded your " },
            {
                type: "link",
                text: "quota",
                href: "https://developers.google.com/youtube/v3/getting-started#quota",
            },
            { type: "text", text: "." },
        ]);
    });

    it("renders code tokens without trusting arbitrary HTML", () => {
        expect(parseYouTubeErrorMessage("Invalid <code>playlistId</code> value")).toEqual([
            { type: "text", text: "Invalid " },
            { type: "code", text: "playlistId" },
            { type: "text", text: " value" },
        ]);
    });

    it("does not create links to untrusted origins", () => {
        expect(parseYouTubeErrorMessage('<a href="https://example.com/phishing">details</a>')).toEqual([
            { type: "text", text: "details" },
        ]);
    });
});
