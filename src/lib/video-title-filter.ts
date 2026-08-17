export interface VideoTitleFilterRules {
    excludedTitleTerms: string[];
    excludedTitleRegexEnabled: boolean;
}

export interface VideoTitleFilterMatch {
    value: string;
    isRegex: boolean;
}

export function getVideoTitleFilterMatch(
    title: string,
    rules: VideoTitleFilterRules
): VideoTitleFilterMatch | null {
    if (rules.excludedTitleRegexEnabled) {
        const pattern = rules.excludedTitleTerms[0]?.trim();
        if (!pattern) return null;
        try {
            return new RegExp(pattern, "i").test(title)
                ? { value: pattern, isRegex: true }
                : null;
        } catch {
            // Settings validation prevents invalid expressions from being saved.
            // Fail open if the database was edited manually.
            return null;
        }
    }

    const normalizedTitle = title.toLocaleLowerCase();
    const term = rules.excludedTitleTerms.find((candidate) => {
        const normalizedTerm = candidate.trim().toLocaleLowerCase();
        return normalizedTerm.length > 0 && normalizedTitle.includes(normalizedTerm);
    });
    return term ? { value: term, isRegex: false } : null;
}

export function getVideoTitleRegexError(pattern: string): string | null {
    if (!pattern.trim()) return null;
    try {
        new RegExp(pattern, "i");
        return null;
    } catch {
        return "The ignored title regular expression is invalid.";
    }
}
