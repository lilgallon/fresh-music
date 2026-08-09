import "server-only";

import { getDb } from "./db";
import { getSettings } from "./repository";
import { getYouTubeQuotaDay, nextYouTubeQuotaReset } from "./youtube-quota-time";
import { readUnitsAtQuotaExhaustion } from "./youtube-quota-error";

export { YOUTUBE_QUOTA_TIME_ZONE, nextYouTubeQuotaReset } from "./youtube-quota-time";

export interface YouTubeQuotaStatus {
    day: string;
    totalLimit: number;
    writeLimit: number;
    readUnits: number;
    writeUnits: number;
    searchCalls: number;
    estimatedTotalUnits: number;
    remainingMutations: number;
    resetAt: string;
    pausedUntil: string | null;
}

interface UsageRow {
    read_units: number;
    write_units: number;
    search_calls: number;
    paused_until: number | null;
}

function ensureUsage(day = getYouTubeQuotaDay()): UsageRow {
    const db = getDb();
    db.prepare("INSERT OR IGNORE INTO youtube_quota_usage (quota_day) VALUES (?)").run(day);
    return db.prepare<[string], UsageRow>(
        `SELECT read_units, write_units, search_calls, paused_until
         FROM youtube_quota_usage WHERE quota_day = ?`
    ).get(day) ?? { read_units: 0, write_units: 0, search_calls: 0, paused_until: null };
}

export function recordYouTubeRead(units = 1): void {
    const day = getYouTubeQuotaDay();
    ensureUsage(day);
    getDb().prepare(
        `UPDATE youtube_quota_usage
         SET read_units = read_units + ?, updated_at = unixepoch()
         WHERE quota_day = ?`
    ).run(Math.max(0, Math.round(units)), day);
}

export function recordYouTubeSearch(): boolean {
    const day = getYouTubeQuotaDay();
    return getDb().transaction(() => {
        const usage = ensureUsage(day);
        const settings = getSettings();
        const searchCost = 100;
        if (usage.paused_until != null && usage.paused_until > Date.now()) return false;
        if (usage.read_units + usage.write_units + searchCost > settings.youtubeDailyQuotaUnits) return false;
        getDb().prepare(
            `UPDATE youtube_quota_usage
             SET search_calls = search_calls + 1,
                 read_units = read_units + ?,
                 updated_at = unixepoch()
             WHERE quota_day = ?`
        ).run(searchCost, day);
        return true;
    })();
}

export function reserveYouTubeWrite(units = 50): { allowed: boolean; reason?: string } {
    const cost = Math.max(0, Math.round(units));
    const day = getYouTubeQuotaDay();
    return getDb().transaction(() => {
        const usage = ensureUsage(day);
        const settings = getSettings();
        if (usage.paused_until != null && usage.paused_until > Date.now()) {
            return { allowed: false, reason: "YouTube quota is paused until its next daily reset." };
        }
        if (usage.write_units + cost > settings.youtubeDailyWriteBudgetUnits) {
            return { allowed: false, reason: "The configured daily YouTube write budget is exhausted." };
        }
        if (usage.read_units + usage.write_units + cost > settings.youtubeDailyQuotaUnits) {
            return { allowed: false, reason: "The configured total YouTube quota is exhausted." };
        }
        getDb().prepare(
            `UPDATE youtube_quota_usage
             SET write_units = write_units + ?, updated_at = unixepoch()
             WHERE quota_day = ?`
        ).run(cost, day);
        return { allowed: true };
    })();
}

export function pauseYouTubeQuota(): number {
    const day = getYouTubeQuotaDay();
    const settings = getSettings();
    const current = ensureUsage(day);
    const exhaustedReadUnits = readUnitsAtQuotaExhaustion(
        settings.youtubeDailyQuotaUnits,
        current.write_units
    );
    const pausedUntil = nextYouTubeQuotaReset();
    getDb().prepare(
        `UPDATE youtube_quota_usage
         SET read_units = ?,
             paused_until = ?,
             updated_at = unixepoch()
         WHERE quota_day = ?`
    ).run(exhaustedReadUnits, pausedUntil, day);
    return pausedUntil;
}

export function getYouTubeQuotaStatus(): YouTubeQuotaStatus {
    const day = getYouTubeQuotaDay();
    const usage = ensureUsage(day);
    const settings = getSettings();
    const remainingByWrite = Math.max(0, settings.youtubeDailyWriteBudgetUnits - usage.write_units);
    const remainingByTotal = Math.max(
        0,
        settings.youtubeDailyQuotaUnits - usage.read_units - usage.write_units
    );
    const pausedUntil = usage.paused_until != null && usage.paused_until > Date.now()
        ? new Date(usage.paused_until).toISOString()
        : null;
    return {
        day,
        totalLimit: settings.youtubeDailyQuotaUnits,
        writeLimit: settings.youtubeDailyWriteBudgetUnits,
        readUnits: usage.read_units,
        writeUnits: usage.write_units,
        searchCalls: usage.search_calls,
        estimatedTotalUnits: pausedUntil ? settings.youtubeDailyQuotaUnits : usage.read_units + usage.write_units,
        remainingMutations: Math.floor(Math.min(remainingByWrite, remainingByTotal) / 50),
        resetAt: new Date(nextYouTubeQuotaReset()).toISOString(),
        pausedUntil,
    };
}

export function isYouTubeQuotaPaused(): boolean {
    return getYouTubeQuotaStatus().pausedUntil != null;
}

export function canUseYouTubeRead(units = 1): boolean {
    const status = getYouTubeQuotaStatus();
    return status.pausedUntil == null
        && status.estimatedTotalUnits + Math.max(1, Math.round(units)) <= status.totalLimit;
}
