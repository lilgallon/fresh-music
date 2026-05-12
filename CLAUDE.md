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

This is a single-page Next.js 14 (App Router) client app. The whole UI lives in one client component, `src/components/Dashboard.tsx`, which owns three pieces of state and persists them to `localStorage`:

- `followedChannels` — the user's subscriptions (default seeds from `src/config/channels.ts` on first load)
- `watchedIds` — array of YouTube video IDs the user has marked watched
- `videos` — derived from `fetchAllVideos(followedChannels)` whenever the channel list changes

The "New" vs "History" tabs are just a filter over `videos` based on `watchedIds`. There is no router-level navigation.

### YouTube API key — dual source (important)

`src/lib/youtube.ts:getApiKey()` resolves the key from one of two places, in order:

1. **Build-time** `NEXT_PUBLIC_YOUTUBE_API_KEY` — baked into the client bundle. Used in dev (`.env.local`) and CI builds.
2. **Runtime** `YOUTUBE_API_KEY` (or `NEXT_PUBLIC_*`) — fetched lazily from `GET /api/config` (`src/app/api/config/route.ts`, `force-dynamic`). This is how the Docker image ships without a baked-in key: users pass `-e YOUTUBE_API_KEY=…` and the client reads it at runtime.

When changing how the key is sourced, update **both** the `NEXT_PUBLIC_` build-time path (Dockerfile `ARG`) and the runtime `/api/config` path, and check `Dockerfile` + `docker-publish.yml` accordingly.

### YouTube fetch quirk

`fetchLatestVideos` first tries the cheap trick of converting a channel ID `UC…` into its uploads playlist ID `UU…`. If that 404s it falls back to a real `channels?part=contentDetails` lookup. Errors are swallowed and return `[]` to keep the UI stable — don't refactor this to throw.

### Styling

Tailwind with CSS-variable-based theming (`hsl(var(--…))` tokens defined in `src/app/globals.css`, mapped in `tailwind.config.ts`). Use the semantic tokens (`bg-background`, `text-foreground`, `border-border`, `bg-primary`, etc.) rather than raw `zinc-*` when adding theme-aware UI; raw `zinc-*` is used in places but the variable system is the intended pattern.

### Path alias

`@/*` → `./src/*` (see `tsconfig.json`).

### Image domains

`next.config.mjs` whitelists `i.ytimg.com` (thumbnails) and `yt3.ggpht.com` (channel avatars). Add new remote hosts there before using them in `next/image`.