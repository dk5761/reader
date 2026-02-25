import { drizzle } from "drizzle-orm/expo-sqlite";
import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";
import { DATABASE_BOOTSTRAP_SQL } from "./migrations";
import * as schema from "./schema";

const DATABASE_NAME = "reader.db";
const LEGACY_SOURCE_ID = "readcomiconline";
const CURRENT_SOURCE_ID = "readcomicsonline";

const sqliteDatabase = openDatabaseSync(DATABASE_NAME);
const drizzleDatabase = drizzle(sqliteDatabase, { schema });

let isDatabaseInitialized = false;
let isLegacySourceMigrationApplied = false;
let isAppSettingsColumnMigrationApplied = false;

const remapSourceId = (sourceId: string): string =>
  sourceId === LEGACY_SOURCE_ID ? CURRENT_SOURCE_ID : sourceId;

const normalizeSourceIdArrayJson = (value: string): string => {
  const raw = value.trim();
  if (!raw) {
    return value;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return value;
  }

  if (!Array.isArray(parsed)) {
    return value;
  }

  const normalized = parsed
    .map((entry) => (typeof entry === "string" ? remapSourceId(entry.trim()) : ""))
    .filter(Boolean);

  return JSON.stringify(Array.from(new Set(normalized)));
};

const normalizeSourceIdListColumn = (params: {
  table: string;
  idColumn: string;
  valueColumn: string;
}): void => {
  const rows = sqliteDatabase.getAllSync<{ id: number; value: string }>(
    `SELECT ${params.idColumn} as id, ${params.valueColumn} as value FROM ${params.table}`
  );

  rows.forEach((row) => {
    const nextValue = normalizeSourceIdArrayJson(row.value ?? "");
    if (nextValue === row.value) {
      return;
    }

    sqliteDatabase.runSync(
      `UPDATE ${params.table} SET ${params.valueColumn} = ? WHERE ${params.idColumn} = ?`,
      nextValue,
      row.id
    );
  });
};

const migrateLegacySourceIds = (): void => {
  if (isLegacySourceMigrationApplied) {
    return;
  }

  sqliteDatabase.withTransactionSync(() => {
    sqliteDatabase.runSync(
      `DELETE FROM library_entries
       WHERE source_id = ?
         AND EXISTS (
           SELECT 1
           FROM library_entries newer
           WHERE newer.source_id = ?
             AND newer.manga_id = library_entries.manga_id
         )`,
      LEGACY_SOURCE_ID,
      CURRENT_SOURCE_ID
    );

    sqliteDatabase.runSync(
      `DELETE FROM reading_progress
       WHERE source_id = ?
         AND EXISTS (
           SELECT 1
           FROM reading_progress newer
           WHERE newer.source_id = ?
             AND newer.manga_id = reading_progress.manga_id
             AND newer.chapter_id = reading_progress.chapter_id
         )`,
      LEGACY_SOURCE_ID,
      CURRENT_SOURCE_ID
    );

    sqliteDatabase.runSync(
      `DELETE FROM reading_history
       WHERE source_id = ?
         AND EXISTS (
           SELECT 1
           FROM reading_history newer
           WHERE newer.source_id = ?
             AND newer.manga_id = reading_history.manga_id
             AND newer.chapter_id = reading_history.chapter_id
         )`,
      LEGACY_SOURCE_ID,
      CURRENT_SOURCE_ID
    );

    sqliteDatabase.runSync(
      `DELETE FROM library_update_state
       WHERE source_id = ?
         AND EXISTS (
           SELECT 1
           FROM library_update_state newer
           WHERE newer.source_id = ?
             AND newer.manga_id = library_update_state.manga_id
         )`,
      LEGACY_SOURCE_ID,
      CURRENT_SOURCE_ID
    );

    [
      "library_entries",
      "reading_progress",
      "reading_history",
      "reading_history_events",
      "library_update_state",
      "library_update_events",
    ].forEach((table) => {
      sqliteDatabase.runSync(
        `UPDATE ${table} SET source_id = ? WHERE source_id = ?`,
        CURRENT_SOURCE_ID,
        LEGACY_SOURCE_ID
      );
    });

    normalizeSourceIdListColumn({
      table: "library_view_settings",
      idColumn: "id",
      valueColumn: "source_filter_json",
    });

    normalizeSourceIdListColumn({
      table: "global_search_settings",
      idColumn: "id",
      valueColumn: "selected_source_ids_json",
    });
  });

  isLegacySourceMigrationApplied = true;
};

const ensureAppSettingsColumns = (): void => {
  if (isAppSettingsColumnMigrationApplied) {
    return;
  }

  const tableInfo = sqliteDatabase.getAllSync<{ name: string }>(
    "PRAGMA table_info(app_settings)"
  );
  const existingColumns = new Set(tableInfo.map((entry) => entry.name));

  const columnStatements: Array<{ name: string; sql: string }> = [
    {
      name: "webtoon_window_ahead",
      sql: "ALTER TABLE app_settings ADD COLUMN webtoon_window_ahead INTEGER NOT NULL DEFAULT 6",
    },
    {
      name: "webtoon_window_behind",
      sql: "ALTER TABLE app_settings ADD COLUMN webtoon_window_behind INTEGER NOT NULL DEFAULT 1",
    },
    {
      name: "webtoon_foreground_concurrency",
      sql: "ALTER TABLE app_settings ADD COLUMN webtoon_foreground_concurrency INTEGER NOT NULL DEFAULT 1",
    },
    {
      name: "webtoon_background_concurrency",
      sql: "ALTER TABLE app_settings ADD COLUMN webtoon_background_concurrency INTEGER NOT NULL DEFAULT 1",
    },
    {
      name: "webtoon_chapter_preload_lead_pages",
      sql: "ALTER TABLE app_settings ADD COLUMN webtoon_chapter_preload_lead_pages INTEGER NOT NULL DEFAULT 4",
    },
    {
      name: "reader_magnifier_enabled",
      sql: "ALTER TABLE app_settings ADD COLUMN reader_magnifier_enabled INTEGER NOT NULL DEFAULT 1",
    },
    {
      name: "reader_magnifier_bubble_size",
      sql: "ALTER TABLE app_settings ADD COLUMN reader_magnifier_bubble_size INTEGER NOT NULL DEFAULT 180",
    },
    {
      name: "reader_magnifier_zoom_scale",
      sql: "ALTER TABLE app_settings ADD COLUMN reader_magnifier_zoom_scale REAL NOT NULL DEFAULT 2.2",
    },
    {
      name: "reader_magnifier_hold_duration_ms",
      sql: "ALTER TABLE app_settings ADD COLUMN reader_magnifier_hold_duration_ms INTEGER NOT NULL DEFAULT 450",
    },
  ];

  sqliteDatabase.withTransactionSync(() => {
    columnStatements.forEach((statement) => {
      if (existingColumns.has(statement.name)) {
        return;
      }
      sqliteDatabase.execSync(statement.sql);
    });
  });

  isAppSettingsColumnMigrationApplied = true;
};

export const initializeDatabase = (): void => {
  if (isDatabaseInitialized) {
    return;
  }

  sqliteDatabase.execSync(DATABASE_BOOTSTRAP_SQL);
  ensureAppSettingsColumns();
  migrateLegacySourceIds();
  isDatabaseInitialized = true;
};

export const getDatabase = () => {
  initializeDatabase();
  return drizzleDatabase;
};

export const getSQLiteDatabase = (): SQLiteDatabase => {
  initializeDatabase();
  return sqliteDatabase;
};

export type AppDatabase = typeof drizzleDatabase;
