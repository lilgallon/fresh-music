# Fresh Music Release Tracker

A modern, minimalist dashboard to track music releases from your favorite YouTube channels.

![homepage](.github/assets/homepage.png)

![settings](.github/assets/settings.png)

## Setup Instructions

1.  **Get a YouTube Data API v3 Key:**
    - Go to the [Google Cloud Console](https://console.cloud.google.com/).
    - Create a new project.
    - Search for "YouTube Data API v3" and enable it.
    - Go to "Credentials" and click "Create Credentials" > "API key".
2.  **Configure Environment Variables:**
    - Create a `.env.local` file in the root of the project.
    - Add your API key:
      ```env
      NEXT_PUBLIC_YOUTUBE_API_KEY=your_api_key_here
      ```
3.  **Customize Channels:**
    - Edit `src/config/channels.ts` to add or remove YouTube channels.
4.  **Run Locally:**
    - `npm install`
    - `npm run dev`

## Features

- **New Releases:** Automatically fetches the latest 5-10 videos from curated channels.
- **Watch Tracking:** Mark videos as watched to move them to the History tab.
- **Persistence:** Watched status is saved in your browser's LocalStorage.
- **Clean Player:** Watch videos directly on the site via a minimalist modal.
- **Mobile First:** Fully responsive design for all devices.
