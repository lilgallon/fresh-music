import { YouTubeVideo } from "@/types/youtube";
import { CheckCircle, Play } from "lucide-react";
import Image from "next/image";

interface VideoCardProps {
    video: YouTubeVideo;
    isWatched: boolean;
    onToggleWatched: (id: string) => void;
    onClick: (video: YouTubeVideo) => void;
}

export default function VideoCard({ video, isWatched, onToggleWatched, onClick }: VideoCardProps) {
    return (
        <div className="group relative flex flex-col space-y-3 rounded-xl border border-border bg-card p-3 hover:border-zinc-700 hover:bg-zinc-900/50 transition-colors">
            <div
                className="relative aspect-video overflow-hidden rounded-lg cursor-pointer bg-zinc-800"
                onClick={() => onClick(video)}
            >
                <Image
                    src={video.thumbnail}
                    alt={video.title}
                    fill
                    className="object-cover transition-transform group-hover:scale-105 will-change-transform"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play className="h-10 w-10 text-white fill-white" />
                </div>
            </div>

            <div className="flex flex-1 flex-col justify-between space-y-2">
                <div className="min-w-0">
                    <h3
                        className="line-clamp-2 cursor-pointer text-sm font-medium leading-tight text-foreground hover:text-zinc-300 transition-colors"
                        onClick={() => onClick(video)}
                    >
                        {video.title}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground truncate">{video.channelTitle}</p>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
                        {new Date(video.publishedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                        })}
                    </span>
                    <button
                        onClick={() => onToggleWatched(video.id)}
                        className={`flex items-center space-x-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${isWatched
                            ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                            : "bg-primary text-primary-foreground hover:bg-zinc-200"
                            }`}
                    >
                        <CheckCircle className={`h-3.5 w-3.5 ${isWatched ? "text-green-500" : ""}`} />
                        <span>{isWatched ? "Watched" : "Done"}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
