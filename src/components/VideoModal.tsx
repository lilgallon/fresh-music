import { YouTubeVideo } from "@/types/youtube";
import { ArrowLeft, ArrowRight, LogOut } from "lucide-react";
import Image from "next/image";
import { MouseEvent, PointerEvent, useEffect, useState } from "react";

interface VideoModalProps {
    video: YouTubeVideo | null;
    previousVideo: YouTubeVideo | null;
    nextVideo: YouTubeVideo | null;
    onClose: () => void;
    onPrevious: () => void;
    onNext: () => void;
    hasAdjacentVideo: boolean;
}

type BackdropIntent = "left" | "right" | "close" | null;

function VideoPreview({ video, align }: { video: YouTubeVideo | null; align: "left" | "right" }) {
    return (
        <div className={`flex min-w-0 items-center gap-3 ${align === "right" ? "justify-end" : ""}`}>
            {align === "left" && (
                <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-md bg-zinc-800">
                    {video?.thumbnail && (
                        <Image src={video.thumbnail} alt="" fill className="object-cover" sizes="80px" />
                    )}
                </div>
            )}
            <span className={`line-clamp-2 ${align === "right" ? "text-right" : "text-left"}`}>
                {align === "left"
                    ? `Valider et revenir a ${video?.title ?? "la musique precedente"}`
                    : `Valider et passer a ${video?.title ?? "la musique suivante"}`}
            </span>
            {align === "right" && (
                <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-md bg-zinc-800">
                    {video?.thumbnail && (
                        <Image src={video.thumbnail} alt="" fill className="object-cover" sizes="80px" />
                    )}
                </div>
            )}
        </div>
    );
}

export default function VideoModal({
    video,
    previousVideo,
    nextVideo,
    onClose,
    onPrevious,
    onNext,
    hasAdjacentVideo,
}: VideoModalProps) {
    const [backdropIntent, setBackdropIntent] = useState<BackdropIntent>(null);
    const [clickFeedback, setClickFeedback] = useState<"left" | "right" | null>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
                return;
            }

            if (e.key === "ArrowLeft" && hasAdjacentVideo) {
                onPrevious();
                return;
            }

            if (e.key === "ArrowRight" && hasAdjacentVideo) {
                onNext();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [hasAdjacentVideo, onClose, onNext, onPrevious]);

    if (!video) return null;

    const getIntentFromPointer = (clientX: number, clientY: number): BackdropIntent => {
        if (clientY > window.innerHeight * 0.76) return "close";
        return clientX < window.innerWidth / 2 ? "left" : "right";
    };

    const handleBackdropPointerMove = (e: PointerEvent<HTMLDivElement>) => {
        setBackdropIntent(getIntentFromPointer(e.clientX, e.clientY));
    };

    const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
        const intent = getIntentFromPointer(e.clientX, e.clientY);

        if (intent === "close" || !hasAdjacentVideo) {
            onClose();
            return;
        }

        setClickFeedback(intent);
        window.setTimeout(() => setClickFeedback(null), 260);

        if (intent === "left") {
            onPrevious();
            return;
        }

        onNext();
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/85 p-4 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={handleBackdropClick}
            onPointerMove={handleBackdropPointerMove}
            onPointerLeave={() => setBackdropIntent(null)}
        >
            <div
                className={`pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-white/15 via-white/5 to-transparent transition-all duration-300 ${
                    backdropIntent === "left" ? "translate-x-0 opacity-100" : "-translate-x-8 opacity-0"
                }`}
            />
            <div
                className={`pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-white/15 via-white/5 to-transparent transition-all duration-300 ${
                    backdropIntent === "right" ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0"
                }`}
            />
            <div
                className={`pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-white/25 via-white/10 to-transparent transition-all duration-300 ${
                    clickFeedback === "left" ? "scale-x-105 opacity-100" : "scale-x-100 opacity-0"
                }`}
            />
            <div
                className={`pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-white/25 via-white/10 to-transparent transition-all duration-300 ${
                    clickFeedback === "right" ? "scale-x-105 opacity-100" : "scale-x-100 opacity-0"
                }`}
            />
            <div
                className={`pointer-events-none absolute inset-x-0 bottom-0 h-[24vh] bg-gradient-to-t from-white/12 to-transparent transition-opacity duration-200 ${
                    backdropIntent === "close" ? "opacity-100" : "opacity-0"
                }`}
            />

            <div className="pointer-events-none absolute inset-x-0 top-4 z-0 flex justify-center px-4 sm:top-6">
                <div className="max-w-[calc(100vw-2rem)] rounded-full border border-white/10 bg-white/10 px-4 py-2 text-center text-xs font-medium text-white/75 shadow-2xl backdrop-blur-md">
                    Gauche/droite: valider et naviguer. Bas: fermer.
                </div>
            </div>

            <div
                className={`pointer-events-none absolute left-4 top-1/2 z-0 flex max-w-[min(23rem,44vw)] -translate-y-1/2 items-center gap-3 rounded-lg border border-white/15 bg-white/15 px-3 py-3 text-sm font-semibold text-white shadow-2xl backdrop-blur-md transition-all duration-200 sm:left-8 ${
                    backdropIntent === "left" && hasAdjacentVideo ? "translate-x-0 opacity-100" : "-translate-x-4 opacity-0"
                }`}
            >
                <ArrowLeft className="h-5 w-5 shrink-0" />
                <VideoPreview video={previousVideo} align="left" />
            </div>

            <div
                className={`pointer-events-none absolute right-4 top-1/2 z-0 flex max-w-[min(23rem,44vw)] -translate-y-1/2 items-center gap-3 rounded-lg border border-white/15 bg-white/15 px-3 py-3 text-sm font-semibold text-white shadow-2xl backdrop-blur-md transition-all duration-200 sm:right-8 ${
                    backdropIntent === "right" && hasAdjacentVideo ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"
                }`}
            >
                <VideoPreview video={nextVideo} align="right" />
                <ArrowRight className="h-5 w-5 shrink-0" />
            </div>

            <div
                className={`pointer-events-none absolute bottom-8 left-1/2 z-0 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-white/15 px-5 py-3 text-sm font-semibold text-white shadow-2xl backdrop-blur-md transition-all duration-200 ${
                    backdropIntent === "close" ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
                }`}
            >
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Fermer la video</span>
            </div>

            <div
                className="relative z-10 w-full max-w-4xl overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-border animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
                onPointerEnter={() => setBackdropIntent(null)}
                onPointerMove={(e) => e.stopPropagation()}
            >
                <div className="aspect-video w-full">
                    <iframe
                        src={`https://www.youtube.com/embed/${video.id}?autoplay=1`}
                        title={video.title}
                        className="h-full w-full"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    ></iframe>
                </div>

                <div className="p-6">
                    <h2 className="text-xl font-semibold text-white">{video.title}</h2>
                    <p className="mt-1 text-sm text-zinc-400">{video.channelTitle}</p>
                </div>
            </div>
        </div>
    );
}
