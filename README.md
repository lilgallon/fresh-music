# Fresh Music Release Tracker

A modern, minimalist dashboard to track music releases from your favorite YouTube channels.

![homepage](.github/assets/homepage.png)

![settings](.github/assets/settings.png)

## Features

- **New Releases:** Automatically fetches the latest 5-10 videos from curated channels.
- **Watch Tracking:** Mark videos as watched to move them to the History tab.
- **Server-side Persistence:** Channels and watched videos are stored in a SQLite database on the server, so your data survives across browsers and devices. LocalStorage is kept as an offline cache for instant load.
- **Clean Player:** Watch videos directly on the site via a minimalist modal.
- **Mobile First:** Fully responsive design for all devices.

## Get started

**Get a YouTube Data API v3 Key:**
- Go to the [Google Cloud Console](https://console.cloud.google.com/).
- Create a new project.
- Search for "YouTube Data API v3" and enable it.
- Go to "Credentials" and click "Create Credentials" > "API key".

## Docker Usage

You can run the application using Docker. The image is optimized for production and supports runtime configuration for the YouTube API Key.

### Running with Docker

Provide your API key at runtime using the `YOUTUBE_API_KEY` environment variable, and mount a volume on `/app/data` to persist the SQLite database across container restarts:
```bash
docker run -p 3000:3000 \
  -e YOUTUBE_API_KEY=YOUR_API_KEY_HERE \
  -v fresh-music-data:/app/data \
  ghcr.io/lilgallon/fresh-music:latest
```

### Running with Docker Compose

```yaml
services:
  fresh-music:
    image: ghcr.io/lilgallon/fresh-music:latest
    ports:
      - "3000:3000"
    environment:
      - YOUTUBE_API_KEY=YOUR_API_KEY_HERE
    volumes:
      - fresh-music-data:/app/data

volumes:
  fresh-music-data:
```

## Dev setup Instructions

1.  **Configure Environment Variables:**
    - Create a `.env.local` file in the root of the project.
    - Add your API key:
      ```env
      NEXT_PUBLIC_YOUTUBE_API_KEY=your_api_key_here
      ```
2.  **Run Locally:**
    - `npm install`
    - `npm run dev`

