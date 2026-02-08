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
`;
