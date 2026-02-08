import { eq } from "drizzle-orm";
import { appSettings, getDatabase } from "@/services/db";
import type {
  AppSettings,
  ReaderDefaultMode,
  UpdateAppSettingsInput,
} from "./settings.types";

const APP_SETTINGS_SINGLETON_ID = 1;

const isReaderDefaultMode = (value: string): value is ReaderDefaultMode =>
  value === "vertical" || value === "horizontal";

const normalizeReaderDefaultMode = (value: string | null | undefined): ReaderDefaultMode =>
  value && isReaderDefaultMode(value) ? value : "vertical";

const mapSettings = (row: typeof appSettings.$inferSelect): AppSettings => ({
  allowNsfwSources: Boolean(row.allowNsfwSources),
  defaultReaderMode: normalizeReaderDefaultMode(row.defaultReaderMode),
  updatedAt: row.updatedAt,
});

const ensureAppSettingsRow = (): void => {
  const db = getDatabase();
  const now = Date.now();

  db.insert(appSettings)
    .values({
      id: APP_SETTINGS_SINGLETON_ID,
      allowNsfwSources: false,
      defaultReaderMode: "vertical",
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: appSettings.id,
    })
    .run();
};

export const getAppSettings = (): AppSettings => {
  const db = getDatabase();
  ensureAppSettingsRow();

  const row = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.id, APP_SETTINGS_SINGLETON_ID))
    .limit(1)
    .get();

  if (!row) {
    const fallbackNow = Date.now();
    db.insert(appSettings)
      .values({
        id: APP_SETTINGS_SINGLETON_ID,
        allowNsfwSources: false,
        defaultReaderMode: "vertical",
        updatedAt: fallbackNow,
      })
      .onConflictDoNothing({
        target: appSettings.id,
      })
      .run();

    return {
      allowNsfwSources: false,
      defaultReaderMode: "vertical",
      updatedAt: fallbackNow,
    };
  }

  return mapSettings(row);
};

export const updateAppSettings = (
  input: UpdateAppSettingsInput
): AppSettings => {
  const db = getDatabase();
  const current = getAppSettings();
  const now = Date.now();

  db.update(appSettings)
    .set({
      allowNsfwSources: input.allowNsfwSources ?? current.allowNsfwSources,
      defaultReaderMode: normalizeReaderDefaultMode(
        input.defaultReaderMode ?? current.defaultReaderMode
      ),
      updatedAt: now,
    })
    .where(eq(appSettings.id, APP_SETTINGS_SINGLETON_ID))
    .run();

  return getAppSettings();
};
