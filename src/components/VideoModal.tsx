import { YouTubeVideo } from "@/types/youtube";
import { X } from "lucide-react";
import { useEffect } from "react";

interface VideoModalProps {
    video: YouTubeVideo | null;
    onClose: () => void;
}

export default function VideoModal({ video, onClose }: VideoModalProps) {
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleEsc);
        return () => window.removeEventListener("keydown", handleEsc);
    }, [onClose]);

    if (!video) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-zinc-900 shadow-2xl animate-in zoom-in-95 duration-200">
                <button
                    onClick={onClose}
                    className="absolute right-4 top-4 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors"
                >
                    <X className="h-6 w-6" />
                </button>

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
