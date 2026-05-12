# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Next.js dev server (port 3000)
- `npm run build` — production build (uses `output: 'standalone'` for the Docker runtime)
- `npm run start` — run the production build locally
- `npm run lint` — ESLint via `next lint` (extends `next/core-web-vitals` + `next/typescript`); CI runs this and fails on errors
- `npm ci --legacy-peer-deps` — install deps the same way CI/Docker does (the `--legacy-peer-deps` flag is required)

There is no test suite. CI (`.github/workflows/ci.yml`) only runs `lint` + `build`. The Docker image is published to `ghcr.io/lilgallon/fresh-music` only on `v*` tag pushes (`docker-publish.yml`).

## Architecture

This is a single-page Next.js 14 (App Router) app. The UI lives mostly in one client component (`src/components/Dashboard.tsx`) which owns the main application state:

- `followedChannels` — the user's subscriptions
- `watchedIds` — array of YouTube video IDs marked as watched
- `settings` — user preferences such as the video lookback window
- `videos` — derived from `fetchAllVideos(followedChannels, settings.videoLookbackDays)` whenever the channel list or lookback setting changes

The "New" vs "History" tabs are just a filter over `videos` based on `watchedIds`. There is no router-level navigation.

`src/components/VideoModal.tsx` owns the player overlay interaction. The close button has intentionally been removed: clicking the bottom backdrop closes the modal, clicking the left backdrop marks the current video watched and navigates to the previous video, and clicking the right backdrop marks it watched and navigates to the next video. The left/right affordances show the target video's thumbnail/title; keep these hints in sync if changing the navigation behavior.

### Persistence — server SQLite + localStorage cache

The **server is the source of truth**: a SQLite DB (via `better-sqlite3`) persists `channels`, `watched_videos`, and `app_settings`. `localStorage` is kept as an offline cache for instant first-paint and resilience when the API is unreachable.

- Singleton DB connection: `src/lib/db.ts` (path from `DB_PATH` env, defaults to `./data/freshmusic.db`).
- Repository (prepared statements): `src/lib/repository.ts`.
- Client wrapper (LS read + fetch + optimistic mutations): `src/lib/storage-client.ts`.
- REST routes (all `force-dynamic`):
  - `GET/PUT /api/channels`, `POST/DELETE /api/channels/[channelId]`
  - `GET/PUT /api/watched`, `POST/DELETE /api/watched/[videoId]`
  - `GET/PUT /api/settings`

**Hydration flow** in `Dashboard.tsx`: read localStorage immediately → fetch server → if server is empty, seed channels (from cached LS, else from `src/config/channels.ts` defaults) → reconcile state. Mutations are optimistic with rollback on API failure. Don't bypass the wrapper — direct `localStorage.setItem` calls would desync the cache from the server.

**Important when adding a route that touches the DB**: import from `@/lib/repository`, never instantiate `better-sqlite3` directly. The DB connection is a process-wide singleton.

### Settings

The video lookback window is stored as `videoLookbackDays` (default `30`, clamped to `1..365`) in `app_settings` under the repository key `video_lookback_days`. It is exposed through `GET/PUT /api/settings` and cached in localStorage by `src/lib/storage-client.ts`. The settings modal (`src/components/ChannelSettings.tsx`) currently offers preset windows from 7 days to 1 year.

### YouTube API key — dual source (important)

`src/lib/youtube.ts:getApiKey()` resolves the key from one of two places, in order:

1. **Build-time** `NEXT_PUBLIC_YOUTUBE_API_KEY` — baked into the client bundle. Used in dev (`.env.local`) and CI builds.
2. **Runtime** `YOUTUBE_API_KEY` (or `NEXT_PUBLIC_*`) — fetched lazily from `GET /api/config` (`src/app/api/config/route.ts`, `force-dynamic`). This is how the Docker image ships without a baked-in key: users pass `-e YOUTUBE_API_KEY=…` and the client reads it at runtime.

When changing how the key is sourced, update **both** the `NEXT_PUBLIC_` build-time path (Dockerfile `ARG`) and the runtime `/api/config` path, and check `Dockerfile` + `docker-publish.yml` accordingly.

### Native module note

`better-sqlite3` is a native Node module. `next.config.mjs` lists it under `experimental.serverComponentsExternalPackages` so it's not bundled by webpack and the `.node` binding ends up in `.next/standalone/node_modules`. The Dockerfile installs `python3 make g++` in the builder stage to compile it. If you add another native dependency, do the same.

### YouTube fetch quirk

`fetchLatestVideos` first tries the cheap trick of converting a channel ID `UC…` into its uploads playlist ID `UU…`. If that 404s it falls back to a real `channels?part=contentDetails` lookup. Errors are swallowed and return `[]` to keep the UI stable — don't refactor this to throw.

The YouTube Data API does not expose a reliable `isShort`/`type=short` flag in the uploads playlist response. After date filtering, `fetchLatestVideos` calls `videos?part=contentDetails` and excludes videos with a duration of 60 seconds or less. If that metadata call fails, it returns the unfiltered list rather than breaking the dashboard.

The lookback setting is applied by fetching up to 50 recent uploads per channel and filtering by `publishedAt >= now - videoLookbackDays`. If a channel publishes more than 50 videos inside the selected window, older videos in that window may not be present without adding pagination.

### Styling

Tailwind with CSS-variable-based theming (`hsl(var(--…))` tokens defined in `src/app/globals.css`, mapped in `tailwind.config.ts`). Use the semantic tokens (`bg-background`, `text-foreground`, `border-border`, `bg-primary`, etc.) rather than raw `zinc-*` when adding theme-aware UI; raw `zinc-*` is used in places but the variable system is the intended pattern.

### Path alias

`@/*` → `./src/*` (see `tsconfig.json`).

### Image domains

`next.config.mjs` whitelists `i.ytimg.com` (thumbnails) and `yt3.ggpht.com` (channel avatars). Add new remote hosts there before using them in `next/image`.
