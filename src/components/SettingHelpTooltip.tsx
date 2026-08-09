"use client";

import { Info } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const OPEN_EVENT = "fresh-music-tooltip-open";

export default function SettingHelpTooltip({ label, children }: {
    label: string;
    children: React.ReactNode;
}) {
    const id = useId();
    const rootRef = useRef<HTMLSpanElement>(null);
    const pinnedBeforePointerRef = useRef(false);
    const pinnedRef = useRef(false);
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState({ left: 16, top: 0, width: 256, above: false });

    const show = (pinned = false) => {
        pinnedRef.current = pinned;
        const rect = rootRef.current?.getBoundingClientRect();
        if (rect) {
            const width = Math.min(256, window.innerWidth - 32);
            const left = Math.min(
                window.innerWidth - width - 16,
                Math.max(16, rect.left + rect.width / 2 - width / 2)
            );
            const above = rect.bottom + 130 > window.innerHeight && rect.top > 130;
            setPosition({ left, width, above, top: above ? rect.top - 8 : rect.bottom + 8 });
        }
        window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
        setOpen(true);
    };

    useEffect(() => {
        const closeOther = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== id) setOpen(false);
        };
        const closeOutside = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const closeWithEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        const closeAfterLayoutChange = () => setOpen(false);
        window.addEventListener(OPEN_EVENT, closeOther);
        document.addEventListener("pointerdown", closeOutside);
        document.addEventListener("keydown", closeWithEscape);
        window.addEventListener("resize", closeAfterLayoutChange);
        return () => {
            window.removeEventListener(OPEN_EVENT, closeOther);
            document.removeEventListener("pointerdown", closeOutside);
            document.removeEventListener("keydown", closeWithEscape);
            window.removeEventListener("resize", closeAfterLayoutChange);
        };
    }, [id]);

    return (
        <span
            ref={rootRef}
            className="relative inline-flex"
            onMouseEnter={() => show(false)}
            onMouseLeave={() => {
                if (!pinnedRef.current) setOpen(false);
            }}
        >
            <button
                type="button"
                aria-label={`Help: ${label}`}
                aria-describedby={open ? id : undefined}
                aria-expanded={open}
                onPointerDown={() => {
                    pinnedBeforePointerRef.current = pinnedRef.current;
                }}
                onClick={() => {
                    if (pinnedBeforePointerRef.current) {
                        pinnedRef.current = false;
                        setOpen(false);
                    } else {
                        show(true);
                    }
                }}
                onFocus={() => show(true)}
                onBlur={() => {
                    pinnedRef.current = false;
                    setOpen(false);
                }}
                className="rounded-full text-zinc-500 outline-none hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-zinc-500"
            >
                <Info className="h-3.5 w-3.5" />
            </button>
            {open && createPortal(
                <span
                    id={id}
                    role="tooltip"
                    style={{
                        left: position.left,
                        top: position.top,
                        width: position.width,
                        transform: position.above ? "translateY(-100%)" : undefined,
                    }}
                    className="fixed z-[70] rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-left text-xs font-normal leading-relaxed text-zinc-300 shadow-2xl"
                >
                    {children}
                </span>,
                document.body
            )}
        </span>
    );
}
