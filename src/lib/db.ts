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
  uploads_playlist_id    TEXT,
  last_discovered_video_id TEXT,
  last_discovery_at      INTEGER,
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

CREATE TABLE IF NOT EXISTS youtube_short_cache (
  video_id   TEXT PRIMARY KEY,
  is_short   INTEGER NOT NULL CHECK (is_short IN (0, 1)),
  checked_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS videos (
  video_id             TEXT PRIMARY KEY,
  channel_id           TEXT,
  title                TEXT NOT NULL DEFAULT '',
  channel_title        TEXT NOT NULL DEFAULT '',
  thumbnail_url        TEXT NOT NULL DEFAULT '',
  published_at         TEXT,
  duration_seconds     INTEGER,
  live_status          TEXT,
  is_short             INTEGER,
  availability_status  TEXT NOT NULL DEFAULT 'available'
                       CHECK (availability_status IN ('available', 'unavailable')),
  discovered_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  metadata_checked_at  INTEGER,
  updated_at           INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_videos_channel_published
  ON videos (channel_id, published_at DESC);

CREATE TABLE IF NOT EXISTS youtube_quota_usage (
  quota_day       TEXT PRIMARY KEY,
  read_units      INTEGER NOT NULL DEFAULT 0,
  write_units     INTEGER NOT NULL DEFAULT 0,
  search_calls    INTEGER NOT NULL DEFAULT 0,
  paused_until    INTEGER,
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS youtube_sync_runs (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger               TEXT NOT NULL,
  status                TEXT NOT NULL,
  phase                 TEXT NOT NULL,
  started_at            INTEGER NOT NULL,
  completed_at          INTEGER,
  channels_total        INTEGER NOT NULL DEFAULT 0,
  channels_processed    INTEGER NOT NULL DEFAULT 0,
  discovered            INTEGER NOT NULL DEFAULT 0,
  catalogued             INTEGER NOT NULL DEFAULT 0,
  remote_items           INTEGER NOT NULL DEFAULT 0,
  pending_adds           INTEGER NOT NULL DEFAULT 0,
  pending_removals       INTEGER NOT NULL DEFAULT 0,
  added                  INTEGER NOT NULL DEFAULT 0,
  removed                INTEGER NOT NULL DEFAULT 0,
  adopted                INTEGER NOT NULL DEFAULT 0,
  skipped_watched        INTEGER NOT NULL DEFAULT 0,
  skipped_filtered       INTEGER NOT NULL DEFAULT 0,
  skipped_existing       INTEGER NOT NULL DEFAULT 0,
  quota_read_units       INTEGER NOT NULL DEFAULT 0,
  quota_write_units      INTEGER NOT NULL DEFAULT 0,
  video_details_version INTEGER NOT NULL DEFAULT 0,
  error                  TEXT
);

CREATE TABLE IF NOT EXISTS youtube_sync_run_videos (
  run_id    INTEGER NOT NULL REFERENCES youtube_sync_runs(id) ON DELETE CASCADE,
  video_id  TEXT NOT NULL,
  action    TEXT NOT NULL CHECK (action IN ('added', 'removed', 'filtered')),
  filter_reason TEXT,
  PRIMARY KEY (run_id, action, video_id)
);
`;

function hasColumn(db: Database.Database, table: string, column: string): boolean {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return rows.some((row) => row.name === column);
}

export function migrateDatabase(db: Database.Database): void {
    const version = db.pragma("user_version", { simple: true }) as number;
    if (version >= 4) return;

    db.transaction(() => {
        if (version < 2) {
            if (!hasColumn(db, "channels", "uploads_playlist_id")) {
                db.exec("ALTER TABLE channels ADD COLUMN uploads_playlist_id TEXT");
            }
            if (!hasColumn(db, "channels", "last_discovered_video_id")) {
                db.exec("ALTER TABLE channels ADD COLUMN last_discovered_video_id TEXT");
            }
            if (!hasColumn(db, "channels", "last_discovery_at")) {
                db.exec("ALTER TABLE channels ADD COLUMN last_discovery_at INTEGER");
            }

            const interval = Number(process.env.PLAYLIST_SYNC_INTERVAL_MINUTES ?? 60);
            const seededInterval = Number.isFinite(interval)
                ? Math.min(1440, Math.max(5, Math.round(interval)))
                : 60;
            db.prepare(
                `INSERT OR IGNORE INTO app_settings (key, value, updated_at)
                 VALUES ('sync_interval_minutes', ?, unixepoch())`
            ).run(String(seededInterval));
        }

        if (version < 3) {
            if (!hasColumn(db, "youtube_sync_runs", "video_details_version")) {
                db.exec(
                    "ALTER TABLE youtube_sync_runs ADD COLUMN video_details_version INTEGER NOT NULL DEFAULT 0"
                );
            }
            db.exec(
                `CREATE TABLE IF NOT EXISTS youtube_sync_run_videos (
                    run_id INTEGER NOT NULL REFERENCES youtube_sync_runs(id) ON DELETE CASCADE,
                    video_id TEXT NOT NULL,
                    action TEXT NOT NULL CHECK (action IN ('added', 'removed', 'filtered')),
                    filter_reason TEXT,
                    PRIMARY KEY (run_id, action, video_id)
                )`
            );
        }

        if (version < 4 && !hasColumn(db, "youtube_sync_run_videos", "filter_reason")) {
            db.exec("ALTER TABLE youtube_sync_run_videos ADD COLUMN filter_reason TEXT");
        }

        db.pragma("user_version = 4");
    })();
}

let instance: Database.Database | null = null;

export function getDb(): Database.Database {
    if (instance) return instance;

    const dbPath = process.env.DB_PATH || path.join(process.cwd(), "data", "freshmusic.db");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA);
    migrateDatabase(db);

    instance = db;
    return db;
}
