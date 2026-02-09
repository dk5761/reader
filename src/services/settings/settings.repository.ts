import { eq } from "drizzle-orm";
import { appSettings, getDatabase, globalSearchSettings } from "@/services/db";
import type {
  AppSettings,
  ReaderDefaultMode,
  UpdateAppSettingsInput,
} from "./settings.types";

const APP_SETTINGS_SINGLETON_ID = 1;
const GLOBAL_SEARCH_SETTINGS_SINGLETON_ID = 1;

const isReaderDefaultMode = (value: string): value is ReaderDefaultMode =>
  value === "vertical" || value === "horizontal";

const normalizeReaderDefaultMode = (value: string | null | undefined): ReaderDefaultMode =>
  value && isReaderDefaultMode(value) ? value : "vertical";

const normalizeSourceIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const ids = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);

  return Array.from(new Set(ids));
};

const parseSourceIdsJson = (rawValue: string | null | undefined): string[] => {
  if (!rawValue) {
    return [];
  }

  try {
    return normalizeSourceIds(JSON.parse(rawValue));
  } catch {
    return [];
  }
};

const mapSettings = (params: {
  appRow: typeof appSettings.$inferSelect;
  globalRow: typeof globalSearchSettings.$inferSelect;
}): AppSettings => ({
  allowNsfwSources: Boolean(params.appRow.allowNsfwSources),
  defaultReaderMode: normalizeReaderDefaultMode(params.appRow.defaultReaderMode),
  globalSearchSelectedSourceIds: parseSourceIdsJson(params.globalRow.selectedSourceIdsJson),
  updatedAt: Math.max(params.appRow.updatedAt, params.globalRow.updatedAt),
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

const ensureGlobalSearchSettingsRow = (): void => {
  const db = getDatabase();
  const now = Date.now();

  db.insert(globalSearchSettings)
    .values({
      id: GLOBAL_SEARCH_SETTINGS_SINGLETON_ID,
      selectedSourceIdsJson: "[]",
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: globalSearchSettings.id,
    })
    .run();
};

export const getAppSettings = (): AppSettings => {
  const db = getDatabase();
  ensureAppSettingsRow();
  ensureGlobalSearchSettingsRow();

  const appRow = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.id, APP_SETTINGS_SINGLETON_ID))
    .limit(1)
    .get();

  const globalRow = db
    .select()
    .from(globalSearchSettings)
    .where(eq(globalSearchSettings.id, GLOBAL_SEARCH_SETTINGS_SINGLETON_ID))
    .limit(1)
    .get();

  if (!appRow) {
    ensureAppSettingsRow();
  }

  if (!globalRow) {
    ensureGlobalSearchSettingsRow();
  }

  const ensuredAppRow =
    appRow ??
    db
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, APP_SETTINGS_SINGLETON_ID))
      .limit(1)
      .get();

  const ensuredGlobalRow =
    globalRow ??
    db
      .select()
      .from(globalSearchSettings)
      .where(eq(globalSearchSettings.id, GLOBAL_SEARCH_SETTINGS_SINGLETON_ID))
      .limit(1)
      .get();

  if (!ensuredAppRow || !ensuredGlobalRow) {
    const fallbackNow = Date.now();
    return {
      allowNsfwSources: false,
      defaultReaderMode: "vertical",
      globalSearchSelectedSourceIds: [],
      updatedAt: fallbackNow,
    };
  }

  return mapSettings({ appRow: ensuredAppRow, globalRow: ensuredGlobalRow });
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

  if (input.globalSearchSelectedSourceIds !== undefined) {
    const selectedSourceIdsJson = JSON.stringify(
      normalizeSourceIds(input.globalSearchSelectedSourceIds)
    );

    db.update(globalSearchSettings)
      .set({
        selectedSourceIdsJson,
        updatedAt: now,
      })
      .where(eq(globalSearchSettings.id, GLOBAL_SEARCH_SETTINGS_SINGLETON_ID))
      .run();
  }

  return getAppSettings();
};
