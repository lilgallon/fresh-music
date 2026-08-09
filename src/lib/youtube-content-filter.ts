export const MAX_SHORT_DURATION_SECONDS = 180;

export interface YouTubeVideoMetadata {
    id: string;
    title: string;
    durationSeconds: number | null;
    liveBroadcastContent: "live" | "upcoming" | "none" | null;
    hasLiveStreamingDetails: boolean;
}

export interface YouTubeContentFilterRules {
    excludedTitleTerms: string[];
    minimumDurationSeconds: number | null;
    maximumDurationSeconds: number | null;
}

export const DEFAULT_CONTENT_FILTER_RULES: YouTubeContentFilterRules = {
    excludedTitleTerms: [],
    minimumDurationSeconds: null,
    maximumDurationSeconds: null,
};

export function normalizeContentFilterRules(value: unknown): YouTubeContentFilterRules {
    const candidate = value && typeof value === "object"
        ? value as Partial<YouTubeContentFilterRules>
        : {};
    const normalizeDuration = (duration: unknown): number | null => {
        if (duration === null || duration === undefined || duration === "") return null;
        const parsed = Number(duration);
        return Number.isFinite(parsed)
            ? Math.min(86_400, Math.max(0, Math.round(parsed)))
            : null;
    };
    return {
        excludedTitleTerms: Array.isArray(candidate.excludedTitleTerms)
            ? candidate.excludedTitleTerms
                .filter((term): term is string => typeof term === "string")
                .map((term) => term.trim().slice(0, 100))
                .filter(Boolean)
                .slice(0, 50)
            : [],
        minimumDurationSeconds: normalizeDuration(candidate.minimumDurationSeconds),
        maximumDurationSeconds: normalizeDuration(candidate.maximumDurationSeconds),
    };
}

export function parseIsoDurationSeconds(duration: string): number | null {
    const match = duration.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
    if (!match) return null;
    const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = match;
    return Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

export async function detectYouTubeShort(videoId: string): Promise<boolean | null> {
    try {
        const response = await fetch(`https://www.youtube.com/shorts/${encodeURIComponent(videoId)}`, {
            method: "HEAD",
            redirect: "manual",
            headers: { Cookie: "SOCS=CAI" },
            signal: AbortSignal.timeout(5_000),
        });
        if (response.status >= 200 && response.status < 300) return true;
        if (
            response.status >= 300
            && response.status < 400
            && response.headers.get("location")?.includes("/watch")
        ) return false;
        return null;
    } catch {
        return null;
    }
}

export async function isYouTubeShort(videoId: string): Promise<boolean> {
    return await detectYouTubeShort(videoId) === true;
}

export async function findIgnoredYouTubeVideoIds(
    metadata: YouTubeVideoMetadata[],
    rules: YouTubeContentFilterRules = DEFAULT_CONTENT_FILTER_RULES,
    checkShort: (videoId: string) => Promise<boolean> = isYouTubeShort
): Promise<Set<string>> {
    const normalizedRules = normalizeContentFilterRules(rules);
    const excludedTitleTerms = normalizedRules.excludedTitleTerms
        .map((term) => term.trim().toLocaleLowerCase())
        .filter(Boolean);
    const ignored = new Set(
        metadata
            .filter((video) =>
                video.liveBroadcastContent === "live"
                || video.liveBroadcastContent === "upcoming"
                || video.hasLiveStreamingDetails
                || excludedTitleTerms.some((term) => video.title.toLocaleLowerCase().includes(term))
                || (
                    video.durationSeconds != null
                    && normalizedRules.minimumDurationSeconds != null
                    && video.durationSeconds < normalizedRules.minimumDurationSeconds
                )
                || (
                    video.durationSeconds != null
                    && normalizedRules.maximumDurationSeconds != null
                    && video.durationSeconds > normalizedRules.maximumDurationSeconds
                )
            )
            .map((video) => video.id)
    );

    const shortCandidates = metadata.filter((video) =>
        !ignored.has(video.id)
        && video.durationSeconds != null
        && video.durationSeconds <= MAX_SHORT_DURATION_SECONDS
    );
    for (let offset = 0; offset < shortCandidates.length; offset += 5) {
        const checks = await Promise.all(
            shortCandidates.slice(offset, offset + 5).map(async (video) => ({
                id: video.id,
                isShort: await checkShort(video.id),
            }))
        );
        for (const result of checks) {
            if (result.isShort) ignored.add(result.id);
        }
    }

    return ignored;
}
