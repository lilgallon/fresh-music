"use client";

import Link from "next/link";
import { History, Music2, PlayCircle, Settings2 } from "lucide-react";

type AppSection = "new" | "history" | "settings";

interface AppNavbarProps {
    activeSection: AppSection;
    onSelectTab?: (tab: "new" | "history") => void;
    newCount?: number | null;
}

function tabClass(active: boolean, mobile = false): string {
    return [
        "flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors",
        mobile ? "flex-1 py-1.5" : "px-3 py-1.5",
        active
            ? "bg-zinc-800 text-white shadow-sm"
            : "text-zinc-500 hover:text-zinc-300",
    ].join(" ");
}

export default function AppNavbar({ activeSection, onSelectTab, newCount }: AppNavbarProps) {
    const renderTab = (tab: "new" | "history", mobile = false) => {
        const label = tab === "new" ? "New" : "History";
        const Icon = tab === "new" ? PlayCircle : History;
        const className = tabClass(activeSection === tab, mobile);

        if (onSelectTab) {
            return (
                <button key={tab} type="button" onClick={() => onSelectTab(tab)} className={className}
                    aria-current={activeSection === tab ? "page" : undefined}>
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                    {tab === "new" && newCount != null && (
                        <span
                            aria-label={`${newCount} new music releases`}
                            className="min-w-5 rounded-full bg-zinc-700 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-zinc-200"
                        >
                            {newCount}
                        </span>
                    )}
                </button>
            );
        }

        return (
            <Link key={tab} href={`/?tab=${tab}`} className={className}
                aria-current={activeSection === tab ? "page" : undefined}>
                <Icon className="h-4 w-4" />
                <span>{label}</span>
                {tab === "new" && newCount != null && (
                    <span
                        aria-label={`${newCount} new music releases`}
                        className="min-w-5 rounded-full bg-zinc-700 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-zinc-200"
                    >
                        {newCount}
                    </span>
                )}
            </Link>
        );
    };

    return (
        <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-8">
                <Link href="/" className="flex items-center gap-2" aria-label="Fresh Music home">
                    <span className="rounded-lg bg-primary p-1.5 text-primary-foreground">
                        <Music2 className="h-5 w-5" />
                    </span>
                    <span className="text-xl font-bold tracking-tight">Fresh Music</span>
                </Link>

                <div className="flex items-center gap-4">
                    <nav className="hidden space-x-1 rounded-lg bg-zinc-900/50 p-1 sm:flex" aria-label="Main navigation">
                        {renderTab("new")}
                        {renderTab("history")}
                    </nav>

                    <Link
                        href="/settings"
                        aria-label="Open settings"
                        aria-current={activeSection === "settings" ? "page" : undefined}
                        className={`rounded-full border p-2.5 transition-colors ${activeSection === "settings"
                            ? "border-zinc-600 bg-zinc-800 text-white"
                            : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                            }`}
                    >
                        <Settings2 className="h-5 w-5" />
                    </Link>
                </div>
            </div>

            <div className="flex justify-center border-t border-zinc-900 bg-zinc-950 px-4 py-2 sm:hidden">
                <nav className="flex w-full space-x-1 rounded-lg bg-zinc-900/50 p-1" aria-label="Main navigation">
                    {renderTab("new", true)}
                    {renderTab("history", true)}
                </nav>
            </div>
        </header>
    );
}
