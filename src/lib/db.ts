import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS channels (
  channel_id    TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  is_music_only INTEGER NOT NULL DEFAULT 1,
  thumbnail     TEXT,
  description   TEXT,
  added_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS watched_videos (
  video_id   TEXT PRIMARY KEY,
  watched_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS youtube_integration (
  id                      INTEGER PRIMARY KEY CHECK (id = 1),
  youtube_channel_id      TEXT,
  youtube_channel_title   TEXT,
  encrypted_refresh_token TEXT,
  playlist_id             TEXT,
  playlist_title          TEXT,
  connected_at            INTEGER,
  updated_at              INTEGER NOT NULL DEFAULT (unixepoch()),
  last_sync_started_at    INTEGER,
  last_sync_completed_at  INTEGER,
  next_sync_at            INTEGER,
  last_sync_status        TEXT NOT NULL DEFAULT 'idle',
  last_sync_error         TEXT,
  last_sync_added         INTEGER NOT NULL DEFAULT 0,
  last_sync_removed       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS youtube_playlist_entries (
  video_id          TEXT PRIMARY KEY,
  source_channel_id TEXT,
  published_at      TEXT,
  playlist_item_id  TEXT,
  state             TEXT NOT NULL DEFAULT 'adding'
                    CHECK (state IN ('adding', 'active', 'removal_pending', 'removed')),
  managed_by_app    INTEGER NOT NULL DEFAULT 1,
  removal_reason    TEXT,
  added_at          INTEGER,
  removed_at        INTEGER,
  last_error        TEXT,
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_youtube_playlist_entries_state
  ON youtube_playlist_entries (state);
`;

let instance: Database.Database | null = null;

export function getDb(): Database.Database {
    if (instance) return instance;

    const dbPath = process.env.DB_PATH || path.join(process.cwd(), "data", "freshmusic.db");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA);

    instance = db;
    return db;
}
