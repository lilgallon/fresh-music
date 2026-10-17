import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
    process.env.DB_PATH = ":memory:";
});
vi.mock("server-only", () => ({}));

import { getDb } from "./db";
import { notifyYouTubeReauthorizationRequired, sendGotifyNotification } from "./notifications";
import { saveYouTubeConnection } from "./youtube-integration-repository";

const fetchMock = vi.fn();

describe("Gotify notifications", () => {
    beforeEach(() => {
        process.env.GOTIFY_URL = "http://gotify/";
        process.env.GOTIFY_TOKEN = "app-token";
        process.env.APP_BASE_URL = "https://music.example.com";
        fetchMock.mockReset();
        fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        getDb().prepare("DELETE FROM youtube_integration").run();
        saveYouTubeConnection("UC123", "Account", "encrypted-token");
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        delete process.env.GOTIFY_URL;
        delete process.env.GOTIFY_TOKEN;
    });

    it("posts the message with the token header and a click URL", async () => {
        await expect(sendGotifyNotification({
            title: "Title",
            message: "Body",
            clickUrl: "https://music.example.com/settings",
        })).resolves.toBe(true);

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("http://gotify/message");
        expect(init.headers).toMatchObject({ "X-Gotify-Key": "app-token" });
        expect(JSON.parse(init.body)).toMatchObject({
            title: "Title",
            message: "Body",
            extras: { "client::notification": { click: { url: "https://music.example.com/settings" } } },
        });
    });

    it("does nothing when Gotify is not configured", async () => {
        delete process.env.GOTIFY_TOKEN;
        await notifyYouTubeReauthorizationRequired();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("notifies once per connection and again after reconnecting", async () => {
        await notifyYouTubeReauthorizationRequired();
        await notifyYouTubeReauthorizationRequired();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        saveYouTubeConnection("UC123", "Account", "new-encrypted-token");
        await notifyYouTubeReauthorizationRequired();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("retries on the next failure when Gotify was unreachable", async () => {
        fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
        vi.spyOn(console, "error").mockImplementation(() => {});

        await notifyYouTubeReauthorizationRequired();
        await notifyYouTubeReauthorizationRequired();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
