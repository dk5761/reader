export const DATABASE_BOOTSTRAP_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS library_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  source_id TEXT NOT NULL,
  manga_id TEXT NOT NULL,
  manga_url TEXT NOT NULL,
  title TEXT NOT NULL,
  thumbnail_url TEXT,
  description TEXT,
  status TEXT,
  added_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_read_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS library_entries_source_manga_unique
  ON library_entries (source_id, manga_id);

CREATE INDEX IF NOT EXISTS library_entries_updated_at_idx
  ON library_entries (updated_at);

CREATE TABLE IF NOT EXISTS reading_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  source_id TEXT NOT NULL,
  manga_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  chapter_title TEXT,
  chapter_number REAL,
  page_index INTEGER NOT NULL DEFAULT 0,
  total_pages INTEGER,
  is_completed INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS reading_progress_source_manga_chapter_unique
  ON reading_progress (source_id, manga_id, chapter_id);

CREATE INDEX IF NOT EXISTS reading_progress_updated_at_idx
  ON reading_progress (updated_at);

CREATE TABLE IF NOT EXISTS reading_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  source_id TEXT NOT NULL,
  manga_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  manga_title TEXT NOT NULL,
  manga_thumbnail_url TEXT,
  chapter_title TEXT,
  chapter_number REAL,
  page_index INTEGER NOT NULL DEFAULT 0,
  total_pages INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS reading_history_source_manga_chapter_unique
  ON reading_history (source_id, manga_id, chapter_id);

CREATE INDEX IF NOT EXISTS reading_history_updated_at_idx
  ON reading_history (updated_at);

CREATE TABLE IF NOT EXISTS reading_history_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  source_id TEXT NOT NULL,
  manga_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  manga_title TEXT NOT NULL,
  manga_thumbnail_url TEXT,
  chapter_title TEXT,
  chapter_number REAL,
  page_index INTEGER NOT NULL DEFAULT 0,
  total_pages INTEGER,
  recorded_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS reading_history_events_source_manga_recorded_at_idx
  ON reading_history_events (source_id, manga_id, recorded_at);

CREATE INDEX IF NOT EXISTS reading_history_events_source_manga_chapter_recorded_at_idx
  ON reading_history_events (source_id, manga_id, chapter_id, recorded_at);

CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY NOT NULL,
  allow_nsfw_sources INTEGER NOT NULL DEFAULT 0,
  default_reader_mode TEXT NOT NULL DEFAULT 'vertical',
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO app_settings (id, allow_nsfw_sources, default_reader_mode, updated_at)
VALUES (1, 0, 'vertical', CAST(strftime('%s', 'now') AS INTEGER) * 1000);

CREATE TABLE IF NOT EXISTS global_search_settings (
  id INTEGER PRIMARY KEY NOT NULL,
  selected_source_ids_json TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO global_search_settings (id, selected_source_ids_json, updated_at)
VALUES (1, '[]', CAST(strftime('%s', 'now') AS INTEGER) * 1000);

CREATE TABLE IF NOT EXISTS library_update_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  source_id TEXT NOT NULL,
  manga_id TEXT NOT NULL,
  chapter_count INTEGER NOT NULL DEFAULT 0,
  latest_chapter_id TEXT,
  latest_chapter_title TEXT,
  latest_chapter_number REAL,
  latest_chapter_uploaded_at TEXT,
  latest_chapter_uploaded_at_ts INTEGER,
  last_checked_at INTEGER NOT NULL,
  last_update_detected_at INTEGER,
  first_synced_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS library_update_state_source_manga_unique
  ON library_update_state (source_id, manga_id);

CREATE INDEX IF NOT EXISTS library_update_state_last_checked_at_idx
  ON library_update_state (last_checked_at);

CREATE INDEX IF NOT EXISTS library_update_state_last_update_detected_at_idx
  ON library_update_state (last_update_detected_at);

CREATE TABLE IF NOT EXISTS library_update_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  source_id TEXT NOT NULL,
  manga_id TEXT NOT NULL,
  manga_title TEXT NOT NULL,
  manga_thumbnail_url TEXT,
  previous_chapter_count INTEGER NOT NULL,
  new_chapter_count INTEGER NOT NULL,
  chapter_delta INTEGER NOT NULL,
  previous_latest_chapter_uploaded_at_ts INTEGER,
  new_latest_chapter_uploaded_at_ts INTEGER,
  detection_mode TEXT NOT NULL,
  detected_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS library_update_events_detected_at_idx
  ON library_update_events (detected_at);

CREATE INDEX IF NOT EXISTS library_update_events_source_manga_detected_at_idx
  ON library_update_events (source_id, manga_id, detected_at);
`;
