export async function register() {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        const { startPlaylistScheduler } = await import("@/lib/playlist-scheduler");
        startPlaylistScheduler();
    }
}
