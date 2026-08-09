const QUOTA_REASONS = new Set([
    "quotaexceeded",
    "dailylimitexceeded",
    "dailylimitexceededunreg",
]);

export function isYouTubeQuotaExceededError(
    status: number,
    reason: string | null,
    message: string
): boolean {
    if (reason && QUOTA_REASONS.has(reason.toLocaleLowerCase())) return true;
    return status === 403 && /(?:quota|daily\s+limit).*(?:exceed|reached)|(?:exceed|reached).*quota/i.test(message);
}

export function readUnitsAtQuotaExhaustion(totalLimit: number, writeUnits: number): number {
    return Math.max(0, Math.round(totalLimit) - Math.max(0, Math.round(writeUnits)));
}
