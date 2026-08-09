export const YOUTUBE_QUOTA_TIME_ZONE = "America/Los_Angeles";

export function getYouTubeQuotaDay(timestamp = Date.now()): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: YOUTUBE_QUOTA_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date(timestamp));
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return `${value("year")}-${value("month")}-${value("day")}`;
}

export function nextYouTubeQuotaReset(timestamp = Date.now()): number {
    const currentDay = getYouTubeQuotaDay(timestamp);
    let low = timestamp;
    let high = timestamp + 36 * 60 * 60 * 1000;
    while (high - low > 1) {
        const middle = Math.floor((low + high) / 2);
        if (getYouTubeQuotaDay(middle) === currentDay) low = middle;
        else high = middle;
    }
    return Math.ceil(high / 1000) * 1000;
}
