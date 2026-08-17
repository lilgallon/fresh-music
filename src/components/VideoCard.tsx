import { YouTubeVideo } from "@/types/youtube";
import { CheckCircle, Play, VideoOff } from "lucide-react";
import Image from "next/image";

interface VideoCardProps {
    video: YouTubeVideo;
    isWatched: boolean;
    onToggleWatched: (video: YouTubeVideo) => void;
    onClick: (video: YouTubeVideo) => void;
    mode: "new" | "history";
}

export default function VideoCard({ video, isWatched, onToggleWatched, onClick, mode }: VideoCardProps) {
    return (
        <article
            data-video-card={video.id}
            className="group relative flex flex-col space-y-3 rounded-xl border border-border bg-card p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-zinc-900/50 hover:shadow-xl"
        >
            <button
                type="button"
                data-video-open={video.id}
                disabled={video.unavailable}
                onClick={() => onClick(video)}
                className="min-w-0 space-y-3 text-left outline-none disabled:cursor-default focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
                <div className="relative aspect-video overflow-hidden rounded-lg bg-zinc-800">
                    {video.thumbnail ? (
                        <Image
                            src={video.thumbnail}
                            alt={video.title}
                            fill
                            className="object-cover transition-transform duration-300 group-hover:scale-105 will-change-transform"
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        />
                    ) : (
                        <div className="flex h-full items-center justify-center text-zinc-600"><VideoOff className="h-9 w-9" /></div>
                    )}
                    {!video.unavailable && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            <Play className="h-10 w-10 fill-white text-white" />
                        </div>
                    )}
                </div>

                <div className="min-w-0">
                    <h3 className="line-clamp-2 text-sm font-medium leading-tight text-foreground transition-colors group-hover:text-zinc-300">
                        {video.title}
                    </h3>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{video.channelTitle}</p>
                </div>
            </button>

            <div className="mt-auto flex items-center justify-between">
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {new Date(video.publishedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                    })}
                </span>
                <button
                    type="button"
                    onClick={() => onToggleWatched(video)}
                    className={`flex items-center space-x-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all active:translate-y-0.5 active:scale-95 ${isWatched
                        ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                        : "bg-primary text-primary-foreground hover:scale-105 hover:bg-zinc-200"
                    }`}
                >
                    <CheckCircle className={`h-3.5 w-3.5 ${isWatched ? "text-green-500" : ""}`} />
                    <span>{mode === "new" ? "Vu" : isWatched ? "Watched" : "Done"}</span>
                </button>
            </div>
        </article>
    );
}
