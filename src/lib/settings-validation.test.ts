import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../types/settings";
import { validateAppSettings } from "./settings-validation";

describe("validateAppSettings", () => {
    it("accepts the documented defaults", () => {
        expect(validateAppSettings(DEFAULT_SETTINGS)).toEqual([]);
    });

    it("rejects unsafe quota and scheduler values", () => {
        const errors = validateAppSettings({
            ...DEFAULT_SETTINGS,
            syncIntervalMinutes: 1,
            youtubeDailyQuotaUnits: 100,
            youtubeDailyWriteBudgetUnits: 75,
        });
        expect(errors).toContain("The sync interval must be between 5 and 1,440 minutes.");
        expect(errors).toContain("The write budget must be a multiple of 50 units.");
    });

    it("rejects an inverted duration range", () => {
        expect(validateAppSettings({
            ...DEFAULT_SETTINGS,
            minimumDurationSeconds: 120,
            maximumDurationSeconds: 60,
        })).toContain("Maximum duration cannot be shorter than minimum duration.");
    });

    it("rejects invalid or ambiguous regular expression filters", () => {
        expect(validateAppSettings({
            ...DEFAULT_SETTINGS,
            excludedTitleTerms: ["["],
            excludedTitleRegexEnabled: true,
        })).toContain("The ignored title regular expression is invalid.");

        expect(validateAppSettings({
            ...DEFAULT_SETTINGS,
            excludedTitleTerms: ["live", "teaser"],
            excludedTitleRegexEnabled: true,
        })).toContain("The regular expression title filter must contain a single pattern.");
    });
});
