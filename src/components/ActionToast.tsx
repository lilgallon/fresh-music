"use client";

import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";

export interface ActionToastMessage {
    id: number;
    message: string;
    tone: "success" | "info" | "error";
    actionLabel?: string;
    action?: () => Promise<void> | void;
}

interface ActionToastProps {
    toast: ActionToastMessage | null;
    onDismiss: (toastId: number) => void;
}

export default function ActionToast({ toast, onDismiss }: ActionToastProps) {
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    useEffect(() => {
        setBusy(false);
        setActionError(null);
        if (!toast) return;
        const timer = window.setTimeout(() => onDismiss(toast.id), 6_000);
        return () => window.clearTimeout(timer);
    }, [onDismiss, toast]);

    if (!toast) return null;

    const tone = actionError ? "error" : toast.tone;
    const Icon = tone === "error" ? AlertTriangle : CheckCircle2;
    const message = actionError ?? toast.message;

    const runAction = async () => {
        if (!toast.action || busy) return;
        setBusy(true);
        setActionError(null);
        try {
            await toast.action();
            onDismiss(toast.id);
        } catch (error) {
            setActionError(error instanceof Error ? error.message : "L’action n’a pas pu être annulée.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-[80] flex justify-center px-4 sm:top-6">
            <div
                role={tone === "error" ? "alert" : "status"}
                aria-live={tone === "error" ? "assertive" : "polite"}
                className={`pointer-events-auto relative flex w-full max-w-xl items-center gap-3 overflow-hidden rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl fresh-toast-enter ${
                    tone === "error"
                        ? "border-red-500/40 bg-red-950/90 text-red-50"
                        : tone === "success"
                            ? "border-emerald-400/35 bg-zinc-950/92 text-white"
                            : "border-blue-400/35 bg-zinc-950/92 text-white"
                }`}
            >
                <Icon className={`h-5 w-5 shrink-0 ${tone === "error" ? "text-red-300" : "text-emerald-300"}`} />
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{message}</p>
                {toast.action && (
                    <button
                        type="button"
                        onClick={runAction}
                        disabled={busy}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20 disabled:opacity-60"
                    >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                        {actionError ? "Réessayer" : toast.actionLabel ?? "Annuler"}
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => onDismiss(toast.id)}
                    aria-label="Fermer la notification"
                    className="shrink-0 rounded-md p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
                >
                    <X className="h-4 w-4" />
                </button>
                <span className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-white/35 fresh-toast-progress" />
            </div>
        </div>
    );
}
