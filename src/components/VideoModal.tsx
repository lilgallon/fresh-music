"use client";

import type { YouTubeVideo } from "@/types/youtube";
import {
    getNewVideoActionForKey,
    isMatchingActionRelease,
    shouldCancelPressedAction,
    type NewVideoAction,
} from "@/lib/new-video-shortcuts";
import {
    ArrowLeft,
    ArrowRight,
    Check,
    Clock3,
    Loader2,
    ThumbsUp,
    X,
} from "lucide-react";
import Image from "next/image";
import {
    MouseEvent,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

export type { NewVideoAction } from "@/lib/new-video-shortcuts";

interface VideoModalProps {
    video: YouTubeVideo | null;
    mode: "new" | "history";
    previousVideo: YouTubeVideo | null;
    nextVideo: YouTubeVideo | null;
    onClose: () => void;
    onHistoryPrevious: () => void;
    onHistoryNext: () => void;
    hasAdjacentVideo: boolean;
    onNewAction: (action: NewVideoAction) => void;
    actionInFlight: NewVideoAction | null;
    feedbackAction: NewVideoAction | null;
    likeDisabledReason: string | null;
}

const ACTION_LABELS: Record<NewVideoAction, string> = {
    stop: "STOP",
    later: "PLUS TARD",
    seen: "VU",
    like: "LIKE",
};

function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable
        || target.tagName === "INPUT"
        || target.tagName === "TEXTAREA"
        || target.tagName === "SELECT";
}

function VideoPreview({ video, align }: { video: YouTubeVideo | null; align: "left" | "right" }) {
    return (
        <div className={`flex min-w-0 items-center gap-3 ${align === "right" ? "justify-end" : ""}`}>
            {align === "left" && (
                <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-md bg-zinc-800">
                    {video?.thumbnail && <Image src={video.thumbnail} alt="" fill className="object-cover" sizes="80px" />}
                </div>
            )}
            <span className={`line-clamp-2 ${align === "right" ? "text-right" : "text-left"}`}>
                {video?.title ?? (align === "left" ? "Vidéo précédente" : "Vidéo suivante")}
            </span>
            {align === "right" && (
                <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-md bg-zinc-800">
                    {video?.thumbnail && <Image src={video.thumbnail} alt="" fill className="object-cover" sizes="80px" />}
                </div>
            )}
        </div>
    );
}

function DecisionButton({
    action,
    label,
    shortcut,
    pressed,
    pending,
    disabled,
    disabledReason,
    onAction,
    onPressedChange,
}: {
    action: NewVideoAction;
    label: string;
    shortcut: string;
    pressed: boolean;
    pending: boolean;
    disabled: boolean;
    disabledReason?: string | null;
    onAction: (action: NewVideoAction) => void;
    onPressedChange: (action: NewVideoAction | null) => void;
}) {
    const styles = {
        stop: {
            button: "border-red-400/50 bg-red-500/15 text-red-300 shadow-red-950/70 hover:bg-red-500/25 hover:shadow-red-500/25",
            key: "bg-red-400/15 text-red-200",
            icon: X,
        },
        later: {
            button: "border-amber-400/50 bg-amber-500/15 text-amber-300 shadow-amber-950/70 hover:bg-amber-500/25 hover:shadow-amber-500/25",
            key: "bg-amber-400/15 text-amber-200",
            icon: Clock3,
        },
        seen: {
            button: "border-emerald-400/50 bg-emerald-500/15 text-emerald-300 shadow-emerald-950/70 hover:bg-emerald-500/25 hover:shadow-emerald-500/25",
            key: "bg-emerald-400/15 text-emerald-200",
            icon: Check,
        },
        like: {
            button: "border-blue-400/50 bg-blue-500/15 text-blue-300 shadow-blue-950/70 hover:bg-blue-500/25 hover:shadow-blue-500/25",
            key: "bg-blue-400/15 text-blue-200",
            icon: ThumbsUp,
        },
    }[action];
    const Icon = styles.icon;

    return (
        <div className="flex min-w-0 flex-col items-center gap-2">
            <button
                type="button"
                onPointerDown={() => !disabled && onPressedChange(action)}
                onPointerUp={() => onPressedChange(null)}
                onPointerCancel={() => onPressedChange(null)}
                onPointerLeave={() => onPressedChange(null)}
                onClick={() => onAction(action)}
                disabled={disabled}
                title={disabledReason ?? `${label} (${shortcut})`}
                aria-label={`${label}, raccourci ${shortcut}`}
                aria-describedby={action === "like" && disabledReason ? "like-disabled-reason" : undefined}
                className={`relative flex h-14 w-14 items-center justify-center rounded-full border shadow-[0_12px_30px_-12px] transition-all duration-150 sm:h-16 sm:w-16 ${styles.button} ${
                    pressed
                        ? "translate-y-1 scale-[0.9] shadow-inner brightness-125 ring-4 ring-current/20"
                        : "translate-y-0 scale-100 hover:-translate-y-1 hover:scale-105"
                } disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0 disabled:hover:scale-100`}
            >
                {pending ? <Loader2 className="h-6 w-6 animate-spin" /> : <Icon className="h-6 w-6" strokeWidth={2.5} />}
                <kbd className={`absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-md border border-white/10 px-1 text-[10px] font-black shadow-lg ${styles.key}`}>
                    {shortcut}
                </kbd>
            </button>
            <span className={`truncate text-[11px] font-semibold sm:text-xs ${disabled ? "text-zinc-600" : "text-zinc-300"}`}>
                {label}
            </span>
        </div>
    );
}

function PlayerCard({
    video,
    children,
    feedbackAction,
}: {
    video: YouTubeVideo;
    children?: React.ReactNode;
    feedbackAction?: NewVideoAction | null;
}) {
    const exitClass = feedbackAction === "stop"
        ? "-translate-x-28 -rotate-2 opacity-0"
        : feedbackAction === "later"
            ? "translate-y-24 scale-95 opacity-0"
            : feedbackAction === "seen"
                ? "translate-x-28 rotate-2 opacity-0"
                : feedbackAction === "like"
                    ? "-translate-y-24 scale-105 opacity-0"
                    : "translate-x-0 translate-y-0 rotate-0 scale-100 opacity-100";
    const stampStyle = feedbackAction === "stop"
        ? "border-red-400 text-red-300 -rotate-6"
        : feedbackAction === "later"
            ? "border-amber-400 text-amber-300 -rotate-3"
            : feedbackAction === "seen"
                ? "border-emerald-400 text-emerald-300 rotate-6"
                : "border-blue-400 text-blue-300 rotate-3";

    return (
        <div
            key={video.id}
            className={`relative w-full max-w-4xl overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-border transition-all duration-300 fresh-video-card-enter ${exitClass}`}
            onClick={(event) => event.stopPropagation()}
        >
            <div className="aspect-video w-full bg-black">
                <iframe
                    src={`https://www.youtube.com/embed/${video.id}?autoplay=1`}
                    title={video.title}
                    className="h-full w-full"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                />
            </div>
            <div className="px-4 pb-4 pt-4 sm:px-6 sm:pb-6">
                <h2 id="video-modal-title" className="line-clamp-2 text-lg font-semibold text-white sm:text-xl">{video.title}</h2>
                <p className="mt-1 text-sm text-zinc-400">{video.channelTitle}</p>
                {children}
            </div>
            {feedbackAction && (
                <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/35 backdrop-blur-[1px]">
                    <span className={`rounded-xl border-4 px-5 py-2 text-2xl font-black tracking-[0.18em] shadow-2xl sm:text-4xl ${stampStyle}`}>
                        {ACTION_LABELS[feedbackAction]}
                    </span>
                </div>
            )}
        </div>
    );
}

export default function VideoModal({
    video,
    mode,
    previousVideo,
    nextVideo,
    onClose,
    onHistoryPrevious,
    onHistoryNext,
    hasAdjacentVideo,
    onNewAction,
    actionInFlight,
    feedbackAction,
    likeDisabledReason,
}: VideoModalProps) {
    const [pressedAction, setPressedAction] = useState<NewVideoAction | null>(null);
    const pressedActionRef = useRef<NewVideoAction | null>(null);
    const dialogRef = useRef<HTMLDivElement>(null);

    const updatePressedAction = useCallback((action: NewVideoAction | null) => {
        pressedActionRef.current = action;
        setPressedAction(action);
    }, []);

    useEffect(() => {
        if (!video) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        window.requestAnimationFrame(() => dialogRef.current?.focus());
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [video]);

    useEffect(() => {
        if (!video) return;

        const resetPressed = () => updatePressedAction(null);
        const handleVisibility = () => {
            if (document.hidden) resetPressed();
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                if (mode === "new") onNewAction("stop");
                else onClose();
                return;
            }
            if (mode !== "new" || actionInFlight || isEditableTarget(event.target)) return;
            if (shouldCancelPressedAction(pressedActionRef.current, event.key)) {
                resetPressed();
                return;
            }
            if (event.metaKey || event.ctrlKey || event.altKey) return;

            const action = getNewVideoActionForKey(event.key);
            if (!action) {
                if (pressedActionRef.current) resetPressed();
                return;
            }
            if (event.repeat) return;
            event.preventDefault();
            updatePressedAction(action);
        };
        const handleKeyUp = (event: KeyboardEvent) => {
            if (mode !== "new" || isEditableTarget(event.target)) return;
            const action = getNewVideoActionForKey(event.key);
            if (!action || !isMatchingActionRelease(pressedActionRef.current, event.key)) return;
            event.preventDefault();
            resetPressed();
            if (action === "like" && likeDisabledReason) return;
            if (!actionInFlight) onNewAction(action);
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        window.addEventListener("blur", resetPressed);
        document.addEventListener("visibilitychange", handleVisibility);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            window.removeEventListener("blur", resetPressed);
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [actionInFlight, likeDisabledReason, mode, onClose, onNewAction, updatePressedAction, video]);

    useEffect(() => {
        if (actionInFlight) updatePressedAction(null);
    }, [actionInFlight, updatePressedAction]);

    if (!video) return null;

    const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
        if (mode === "new") {
            onNewAction("stop");
            return;
        }
        if (!hasAdjacentVideo || event.clientY > window.innerHeight * 0.76) {
            onClose();
            return;
        }
        if (event.clientX < window.innerWidth / 2) onHistoryPrevious();
        else onHistoryNext();
    };

    return (
        <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="video-modal-title"
            tabIndex={-1}
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/[0.88] p-3 backdrop-blur-md outline-none sm:p-6"
            onClick={handleBackdropClick}
        >
            {mode === "history" && hasAdjacentVideo && (
                <>
                    <div className="pointer-events-none absolute left-4 top-1/2 hidden max-w-[22rem] -translate-y-1/2 items-center gap-3 rounded-xl border border-white/15 bg-black/55 px-3 py-3 text-sm font-semibold text-white shadow-2xl backdrop-blur-md lg:flex">
                        <ArrowLeft className="h-5 w-5 shrink-0" />
                        <VideoPreview video={previousVideo} align="left" />
                    </div>
                    <div className="pointer-events-none absolute right-4 top-1/2 hidden max-w-[22rem] -translate-y-1/2 items-center gap-3 rounded-xl border border-white/15 bg-black/55 px-3 py-3 text-sm font-semibold text-white shadow-2xl backdrop-blur-md lg:flex">
                        <VideoPreview video={nextVideo} align="right" />
                        <ArrowRight className="h-5 w-5 shrink-0" />
                    </div>
                </>
            )}

            <PlayerCard video={video} feedbackAction={mode === "new" ? feedbackAction : null}>
                {mode === "new" && (
                    <>
                        <div className="mt-5 grid grid-cols-4 gap-2 border-t border-white/10 pt-5 sm:gap-5">
                            <DecisionButton action="stop" label="Stop" shortcut="X" pressed={pressedAction === "stop"} pending={actionInFlight === "stop"} disabled={Boolean(actionInFlight)} onAction={onNewAction} onPressedChange={updatePressedAction} />
                            <DecisionButton action="later" label="Plus tard" shortcut="C" pressed={pressedAction === "later"} pending={actionInFlight === "later"} disabled={Boolean(actionInFlight)} onAction={onNewAction} onPressedChange={updatePressedAction} />
                            <DecisionButton action="seen" label="Vu" shortcut="V" pressed={pressedAction === "seen"} pending={actionInFlight === "seen"} disabled={Boolean(actionInFlight)} onAction={onNewAction} onPressedChange={updatePressedAction} />
                            <DecisionButton action="like" label="Like" shortcut="B" pressed={pressedAction === "like"} pending={actionInFlight === "like"} disabled={Boolean(actionInFlight) || Boolean(likeDisabledReason)} disabledReason={likeDisabledReason} onAction={onNewAction} onPressedChange={updatePressedAction} />
                        </div>
                        {likeDisabledReason && (
                            <p id="like-disabled-reason" className="mt-3 text-center text-xs text-zinc-500">
                                Like indisponible : {likeDisabledReason}
                            </p>
                        )}
                    </>
                )}
            </PlayerCard>
        </div>
    );
}
