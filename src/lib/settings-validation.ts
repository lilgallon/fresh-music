import type { AppSettings } from "@/types/settings";
import { getVideoTitleRegexError } from "./video-title-filter";

function integerInRange(value: unknown, minimum: number, maximum: number): boolean {
    return typeof value === "number"
        && Number.isInteger(value)
        && value >= minimum
        && value <= maximum;
}

export function validateAppSettings(settings: AppSettings): string[] {
    const errors: string[] = [];
    if (typeof settings.automaticSyncEnabled !== "boolean") {
        errors.push("Automatic synchronization must be enabled or disabled.");
    }
    if (!integerInRange(settings.syncIntervalMinutes, 5, 1440)) {
        errors.push("The sync interval must be between 5 and 1,440 minutes.");
    }
    if (!integerInRange(settings.youtubeDailyQuotaUnits, 50, 1_000_000)) {
        errors.push("The daily YouTube quota must be between 50 and 1,000,000 units.");
    }
    if (!integerInRange(settings.youtubeDailyWriteBudgetUnits, 0, 1_000_000)) {
        errors.push("The daily write budget must be between 0 and 1,000,000 units.");
    } else if (settings.youtubeDailyWriteBudgetUnits % 50 !== 0) {
        errors.push("The write budget must be a multiple of 50 units.");
    }
    if (settings.youtubeDailyWriteBudgetUnits > settings.youtubeDailyQuotaUnits) {
        errors.push("The write budget cannot exceed the total quota.");
    }
    if (!integerInRange(settings.maxPlaylistAddsPerSync, 1, 1000)) {
        errors.push("Maximum additions must be between 1 and 1,000.");
    }
    if (!integerInRange(settings.maxPlaylistRemovalsPerSync, 1, 1000)) {
        errors.push("Maximum removals must be between 1 and 1,000.");
    }
    if (!integerInRange(settings.maxDiscoveryPagesPerChannel, 1, 100)) {
        errors.push("Maximum pages per channel must be between 1 and 100.");
    }
    if (!integerInRange(settings.shortCacheTtlDays, 1, 365)) {
        errors.push("The Shorts cache duration must be between 1 and 365 days.");
    }
    if (!integerInRange(settings.videoLookbackDays, 1, 365)) {
        errors.push("The video window must be between 1 and 365 days.");
    }
    for (const [label, value] of [
        ["Minimum duration", settings.minimumDurationSeconds],
        ["Maximum duration", settings.maximumDurationSeconds],
    ] as const) {
        if (value != null && !integerInRange(value, 0, 86_400)) {
            errors.push(`${label} must be between 0 and 86,400 seconds.`);
        }
    }
    if (
        settings.minimumDurationSeconds != null
        && settings.maximumDurationSeconds != null
        && settings.maximumDurationSeconds < settings.minimumDurationSeconds
    ) {
        errors.push("Maximum duration cannot be shorter than minimum duration.");
    }
    if (!Array.isArray(settings.excludedTitleTerms)
        || settings.excludedTitleTerms.some((term) => typeof term !== "string")) {
        errors.push("Ignored title fragments must be a list of text values.");
    }
    if (typeof settings.excludedTitleRegexEnabled !== "boolean") {
        errors.push("Regular expression title filtering must be enabled or disabled.");
    } else if (settings.excludedTitleRegexEnabled && Array.isArray(settings.excludedTitleTerms)) {
        if (settings.excludedTitleTerms.length > 1) {
            errors.push("The regular expression title filter must contain a single pattern.");
        } else {
            const pattern = settings.excludedTitleTerms[0] ?? "";
            if (pattern.length > 100) {
                errors.push("The ignored title regular expression must not exceed 100 characters.");
            } else {
                const regexError = getVideoTitleRegexError(pattern);
                if (regexError) errors.push(regexError);
            }
        }
    }
    return errors;
}
