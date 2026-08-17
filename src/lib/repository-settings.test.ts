import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
    process.env.DB_PATH = ":memory:";
});
vi.mock("server-only", () => ({}));
vi.mock("@/types/settings", async () => import("../types/settings"));

import { getDb } from "./db";
import { getSettings, saveSettings } from "./repository";

describe("settings persistence", () => {
    beforeEach(() => {
        getDb().prepare("DELETE FROM app_settings").run();
    });

    it("keeps legacy settings in plain-fragment mode", () => {
        getDb().prepare(
            "INSERT INTO app_settings (key, value) VALUES ('excluded_title_terms', ?)"
        ).run(JSON.stringify(["teaser", "trailer"]));

        expect(getSettings()).toMatchObject({
            excludedTitleTerms: ["teaser", "trailer"],
            excludedTitleRegexEnabled: false,
        });
    });

    it("persists global regular expression mode", () => {
        saveSettings({
            excludedTitleTerms: ["(official|audio)$"],
            excludedTitleRegexEnabled: true,
        });

        expect(getSettings()).toMatchObject({
            excludedTitleTerms: ["(official|audio)$"],
            excludedTitleRegexEnabled: true,
        });
    });
});
