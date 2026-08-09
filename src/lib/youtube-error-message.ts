export type YouTubeErrorMessageSegment =
    | { type: "text"; text: string }
    | { type: "code"; text: string }
    | { type: "link"; text: string; href: string };

function decodeEntities(value: string): string {
    return value
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&quot;", '"')
        .replaceAll("&#39;", "'")
        .replaceAll("&amp;", "&");
}

function plainText(value: string): string {
    return decodeEntities(value.replace(/<[^>]*>/g, ""));
}

function safeGoogleHref(value: string): string | null {
    if (value.startsWith("/youtube/")) return `https://developers.google.com${value}`;
    try {
        const url = new URL(value);
        if (url.protocol !== "https:") return null;
        if (url.hostname !== "developers.google.com" && url.hostname !== "support.google.com") return null;
        return url.toString();
    } catch {
        return null;
    }
}

export function parseYouTubeErrorMessage(message: string): YouTubeErrorMessageSegment[] {
    const segments: YouTubeErrorMessageSegment[] = [];
    const pattern = /<a\s+[^>]*href=(['"])(.*?)\1[^>]*>([\s\S]*?)<\/a>|<code>([\s\S]*?)<\/code>/gi;
    let offset = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(message)) !== null) {
        const index = match.index ?? 0;
        if (index > offset) segments.push({ type: "text", text: plainText(message.slice(offset, index)) });
        if (match[4] != null) {
            segments.push({ type: "code", text: plainText(match[4]) });
        } else {
            const href = safeGoogleHref(match[2]);
            const text = plainText(match[3]);
            segments.push(href ? { type: "link", text, href } : { type: "text", text });
        }
        offset = index + match[0].length;
    }
    if (offset < message.length) segments.push({ type: "text", text: plainText(message.slice(offset)) });
    return segments.filter((segment) => segment.text.length > 0);
}
