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

This is a single-page Next.js 14 (App Router) app. The UI lives in one client component (`src/components/Dashboard.tsx`) which owns three pieces of state:

- `followedChannels` — the user's subscriptions
- `watchedIds` — array of YouTube video IDs marked as watched
- `videos` — derived from `fetchAllVideos(followedChannels)` whenever the channel list changes

The "New" vs "History" tabs are just a filter over `videos` based on `watchedIds`. There is no router-level navigation.

### Persistence — server SQLite + localStorage cache

The **server is the source of truth**: a SQLite DB (via `better-sqlite3`) persists `channels` and `watched_videos`. `localStorage` is kept as an offline cache for instant first-paint and resilience when the API is unreachable.

- Singleton DB connection: `src/lib/db.ts` (path from `DB_PATH` env, defaults to `./data/freshmusic.db`).
- Repository (prepared statements): `src/lib/repository.ts`.
- Client wrapper (LS read + fetch + optimistic mutations): `src/lib/storage-client.ts`.
- REST routes (all `force-dynamic`):
  - `GET/PUT /api/channels`, `POST/DELETE /api/channels/[channelId]`
  - `GET/PUT /api/watched`, `POST/DELETE /api/watched/[videoId]`

**Hydration flow** in `Dashboard.tsx`: read localStorage immediately → fetch server → if server is empty, seed it (from cached LS, else from `src/config/channels.ts` defaults) → reconcile state. Mutations are optimistic with rollback on API failure. Don't bypass the wrapper — direct `localStorage.setItem` calls would desync the cache from the server.

**Important when adding a route that touches the DB**: import from `@/lib/repository`, never instantiate `better-sqlite3` directly. The DB connection is a process-wide singleton.

### YouTube API key — dual source (important)

`src/lib/youtube.ts:getApiKey()` resolves the key from one of two places, in order:

1. **Build-time** `NEXT_PUBLIC_YOUTUBE_API_KEY` — baked into the client bundle. Used in dev (`.env.local`) and CI builds.
2. **Runtime** `YOUTUBE_API_KEY` (or `NEXT_PUBLIC_*`) — fetched lazily from `GET /api/config` (`src/app/api/config/route.ts`, `force-dynamic`). This is how the Docker image ships without a baked-in key: users pass `-e YOUTUBE_API_KEY=…` and the client reads it at runtime.

When changing how the key is sourced, update **both** the `NEXT_PUBLIC_` build-time path (Dockerfile `ARG`) and the runtime `/api/config` path, and check `Dockerfile` + `docker-publish.yml` accordingly.

### Native module note

`better-sqlite3` is a native Node module. `next.config.mjs` lists it under `experimental.serverComponentsExternalPackages` so it's not bundled by webpack and the `.node` binding ends up in `.next/standalone/node_modules`. The Dockerfile installs `python3 make g++` in the builder stage to compile it. If you add another native dependency, do the same.

### YouTube fetch quirk

`fetchLatestVideos` first tries the cheap trick of converting a channel ID `UC…` into its uploads playlist ID `UU…`. If that 404s it falls back to a real `channels?part=contentDetails` lookup. Errors are swallowed and return `[]` to keep the UI stable — don't refactor this to throw.

### Styling

Tailwind with CSS-variable-based theming (`hsl(var(--…))` tokens defined in `src/app/globals.css`, mapped in `tailwind.config.ts`). Use the semantic tokens (`bg-background`, `text-foreground`, `border-border`, `bg-primary`, etc.) rather than raw `zinc-*` when adding theme-aware UI; raw `zinc-*` is used in places but the variable system is the intended pattern.

### Path alias

`@/*` → `./src/*` (see `tsconfig.json`).

### Image domains

`next.config.mjs` whitelists `i.ytimg.com` (thumbnails) and `yt3.ggpht.com` (channel avatars). Add new remote hosts there before using them in `next/image`.