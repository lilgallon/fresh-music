# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Next.js dev server (port 3000)
- `npm run build` — production build (uses `output: 'standalone'` for the Docker runtime)
- `npm run start` — run the production build locally
- `npm run lint` — ESLint via `next lint` (extends `next/core-web-vitals` + `next/typescript`); CI runs this and fails on errors
- `npm test` — run the Vitest unit suite
- `npm ci --legacy-peer-deps` — install deps the same way CI/Docker does (the `--legacy-peer-deps` flag is required)

CI (`.github/workflows/ci.yml`) runs `lint`, `test`, and `build`. The Docker image is published to `ghcr.io/lilgallon/fresh-music` only on `v*` tag pushes (`docker-publish.yml`).

## Architecture

This is a single-page Next.js 14 (App Router) app. The UI lives mostly in one client component (`src/components/Dashboard.tsx`) which owns the main application state:

- `followedChannels` — the user's subscriptions
- `watchedIds` — array of YouTube video IDs marked as watched
- `settings` — user preferences such as the video lookback window
- `videos` — paged from the local SQLite catalogue through `GET /api/videos`; the browser never calls YouTube directly

The "New" vs "History" tabs are just a filter over `videos` based on `watchedIds`; `/settings` is the only separate application page.

All configuration, YouTube diagnostics, channel management, and backup controls live on the dedicated `/settings` page (`src/components/SettingsPage.tsx` + `ChannelSettings.tsx`). OAuth redirects back to this page. Do not reintroduce the former settings modal into `Dashboard.tsx`.

`src/components/VideoModal.tsx` owns the player overlay interaction. The close button has intentionally been removed: clicking the bottom backdrop closes the modal, clicking the left backdrop marks the current video watched and navigates to the previous video, and clicking the right backdrop marks it watched and navigates to the next video. The left/right affordances show the target video's thumbnail/title; keep these hints in sync if changing the navigation behavior.

### Persistence — server SQLite + localStorage cache

The **server is the source of truth**: a SQLite DB (via `better-sqlite3`) persists channels, watched videos, settings, the local video catalogue, playlist entries, daily quota counters, and the latest 30 synchronization runs. `localStorage` is kept only as a bootstrap/offline cache for channels, watched IDs, and settings.

- Singleton DB connection: `src/lib/db.ts` (path from `DB_PATH` env, defaults to `./data/freshmusic.db`).
- Repository (prepared statements): `src/lib/repository.ts`.
- Client wrapper (LS read + fetch + optimistic mutations): `src/lib/storage-client.ts`.
- REST routes (all `force-dynamic`):
  - `GET/PUT /api/channels`, `POST/DELETE /api/channels/[channelId]`
  - `GET/PUT /api/watched`, `POST/DELETE /api/watched/[videoId]`
  - `GET/PUT /api/settings`
  - `POST /api/bootstrap`, `GET /api/videos`
  - `GET /api/youtube/channels/search`, `GET /api/youtube/connection`, `POST /api/youtube/sync`

**Hydration flow** in `Dashboard.tsx`: read localStorage immediately → atomically call `/api/bootstrap` → seed empty server tables from the cache/default channels → mark initialization complete → allow background discovery/synchronization. No YouTube write is allowed before this flag. Mutations are optimistic with rollback on API failure. Don't bypass the wrapper — direct `localStorage.setItem` calls would desync the cache from the server.

**Important when adding a route that touches the DB**: import from `@/lib/repository`, never instantiate `better-sqlite3` directly. The DB connection is a process-wide singleton.

### Settings

Functional settings live in `app_settings` and are exposed through validated `GET/PUT /api/settings`: lookback and content filters, automatic scheduling, interval, quota/write budgets, per-sync add/remove limits, discovery pagination, and Shorts TTL. Changes are effective without a restart and reschedule the timer when necessary. Secrets and infrastructure remain environment-only.

### YouTube API and synchronization

`YOUTUBE_API_KEY` is server-only. Never reintroduce `NEXT_PUBLIC_YOUTUBE_API_KEY` or expose it through a config endpoint. Channel search and catalogue discovery are internal server routes; tab changes and pagination read only SQLite.

`src/lib/youtube-sync-manager.ts` owns the process-wide synchronization lock and execution phases. `src/lib/youtube-catalog-discovery.ts` incrementally reads upload playlists, batches metadata by 50, and persists it before playlist reconciliation. `src/lib/youtube-quota.ts` counts estimated read/search/write units per Pacific quota day and atomically reserves 50 units before every mutation. Google Cloud remains authoritative for actual project consumption.

### Native module note

`better-sqlite3` is a native Node module. `next.config.mjs` lists it under `experimental.serverComponentsExternalPackages` so it's not bundled by webpack and the `.node` binding ends up in `.next/standalone/node_modules`. The Dockerfile installs `python3 make g++` in the builder stage to compile it. If you add another native dependency, do the same.

### YouTube fetch quirk

Discovery first tries the cheap conversion from channel ID `UC…` to uploads playlist ID `UU…`, then persists the real uploads ID if a `channels.list` fallback is required. It stops at the last known upload, the configured lookback cutoff, or the page limit. Do not advance the last-known marker until metadata persistence succeeds.

The YouTube Data API does not expose a reliable `isShort`/`type=short` flag. Fresh Music gets duration/live metadata from batched `videos.list` calls. Videos up to three minutes are checked with a server-side `HEAD /shorts/{videoId}` request; this uses no Data API quota, is cached with the configurable TTL, and fails open. Existing metadata is refreshed only when stale. The dashboard and playlist use the same eligibility calculation from SQLite.

Playlist reconciliation reads the remote playlist once, prioritizes pending/watched removals, then computes eligible unwatched local videos minus remote/managed entries and adds only the missing subset, oldest first. Never insert an `adding` entry without rechecking watched state and the per-run limit.

### Styling

Tailwind with CSS-variable-based theming (`hsl(var(--…))` tokens defined in `src/app/globals.css`, mapped in `tailwind.config.ts`). Use the semantic tokens (`bg-background`, `text-foreground`, `border-border`, `bg-primary`, etc.) rather than raw `zinc-*` when adding theme-aware UI; raw `zinc-*` is used in places but the variable system is the intended pattern.

### Path alias

`@/*` → `./src/*` (see `tsconfig.json`).

### Image domains

`next.config.mjs` whitelists `i.ytimg.com` (thumbnails) and `yt3.ggpht.com` (channel avatars). Add new remote hosts there before using them in `next/image`.
