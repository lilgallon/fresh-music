"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { fetchYouTubeIntegration } from "@/lib/storage-client";
import { isYouTubeQuotaExhausted } from "@/lib/youtube-quota-status";
import type { YouTubeIntegrationPublicStatus } from "@/types/youtube-integration";

function formatReset(value: string): string {
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}

export default function YouTubeQuotaBanner() {
    const [status, setStatus] = useState<YouTubeIntegrationPublicStatus | null>(null);

    const refresh = useCallback(async () => {
        try {
            setStatus(await fetchYouTubeIntegration());
        } catch {
            // The catalogue remains usable if the local status endpoint is unavailable.
        }
    }, []);

    useEffect(() => {
        void refresh();
        const timer = window.setInterval(refresh, 30_000);
        window.addEventListener("focus", refresh);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("focus", refresh);
        };
    }, [refresh]);

    if (!status || !isYouTubeQuotaExhausted(status.quota)) return null;

    return (
        <div role="alert" className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-700/50 bg-amber-950/30 p-4 text-amber-100 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                <div>
                    <p className="text-sm font-semibold">YouTube quota exhausted</p>
                    <p className="mt-1 text-xs leading-relaxed text-amber-200/75">
                        YouTube operations are paused until {formatReset(status.quota.pausedUntil ?? status.quota.resetAt)}.
                        Your local catalogue and history remain available.
                    </p>
                </div>
            </div>
            <Link href="/settings" className="inline-flex shrink-0 items-center gap-1.5 self-start text-xs font-semibold text-amber-200 underline decoration-amber-500/60 underline-offset-4 hover:text-white sm:self-auto">
                View quota details <ArrowRight className="h-3.5 w-3.5" />
            </Link>
        </div>
    );
}
