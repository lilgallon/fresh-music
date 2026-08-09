import type { YouTubeIntegrationPublicStatus } from "@/types/youtube-integration";

type QuotaStatus = YouTubeIntegrationPublicStatus["quota"];

export function isYouTubeQuotaExhausted(quota: QuotaStatus): boolean {
    return Boolean(quota.pausedUntil)
        || (quota.totalLimit > 0 && quota.estimatedTotalUnits >= quota.totalLimit);
}
