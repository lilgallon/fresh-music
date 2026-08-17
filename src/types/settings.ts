export interface AppSettings {
    videoLookbackDays: number;
    excludedTitleTerms: string[];
    excludedTitleRegexEnabled: boolean;
    minimumDurationSeconds: number | null;
    maximumDurationSeconds: number | null;
    automaticSyncEnabled: boolean;
    syncIntervalMinutes: number;
    youtubeDailyQuotaUnits: number;
    youtubeDailyWriteBudgetUnits: number;
    maxPlaylistAddsPerSync: number;
    maxPlaylistRemovalsPerSync: number;
    maxDiscoveryPagesPerChannel: number;
    shortCacheTtlDays: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
    videoLookbackDays: 30,
    excludedTitleTerms: [],
    excludedTitleRegexEnabled: false,
    minimumDurationSeconds: null,
    maximumDurationSeconds: null,
    automaticSyncEnabled: true,
    syncIntervalMinutes: 60,
    youtubeDailyQuotaUnits: 10_000,
    youtubeDailyWriteBudgetUnits: 5_000,
    maxPlaylistAddsPerSync: 25,
    maxPlaylistRemovalsPerSync: 25,
    maxDiscoveryPagesPerChannel: 10,
    shortCacheTtlDays: 30,
};
