import { parseYouTubeErrorMessage } from "@/lib/youtube-error-message";

export default function YouTubeErrorMessage({ message }: { message: string }) {
    return parseYouTubeErrorMessage(message).map((segment, index) => {
        if (segment.type === "link") {
            return (
                <a
                    key={index}
                    href={segment.href}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-red-300/60 underline-offset-2 hover:text-white"
                >
                    {segment.text}
                </a>
            );
        }
        if (segment.type === "code") {
            return <code key={index} className="rounded bg-black/30 px-1 py-0.5">{segment.text}</code>;
        }
        return <span key={index}>{segment.text}</span>;
    });
}
