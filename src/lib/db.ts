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
