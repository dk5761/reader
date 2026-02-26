import { eq } from "drizzle-orm";
import { appSettings, getDatabase, globalSearchSettings } from "@/services/db";
import type {
  AppSettings,
  ReaderDefaultMode,
  UpdateAppSettingsInput,
} from "./settings.types";

const APP_SETTINGS_SINGLETON_ID = 1;
const GLOBAL_SEARCH_SETTINGS_SINGLETON_ID = 1;
const DEFAULT_MAGNIFIER_SOURCE_ID = "readcomicsonline";

const isReaderDefaultMode = (value: string): value is ReaderDefaultMode =>
  value === "vertical";

const normalizeReaderDefaultMode = (value: string | null | undefined): ReaderDefaultMode =>
  value && isReaderDefaultMode(value) ? value : "vertical";

const clampInt = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.floor(value)));

const normalizeWebtoonWindowAhead = (value: number | null | undefined): number =>
  clampInt(value ?? 6, 3, 12);

const normalizeWebtoonWindowBehind = (value: number | null | undefined): number =>
  clampInt(value ?? 1, 0, 3);

const normalizeWebtoonForegroundConcurrency = (value: number | null | undefined): number =>
  clampInt(value ?? 1, 1, 2);

const normalizeWebtoonBackgroundConcurrency = (value: number | null | undefined): number =>
  clampInt(value ?? 1, 0, 2);

const normalizeWebtoonChapterPreloadLeadPages = (value: number | null | undefined): number =>
  clampInt(value ?? 4, 2, 8);

const normalizeReaderMagnifierEnabled = (value: boolean | number | null | undefined): boolean =>
  Boolean(value ?? true);

const normalizeReaderMagnifierBubbleSize = (value: number | null | undefined): number =>
  clampInt(value ?? 180, 120, 280);

const normalizeReaderMagnifierZoomScale = (value: number | null | undefined): number => {
  const numeric = Number.isFinite(value) ? Number(value) : 2.2;
  const clamped = Math.max(1.5, Math.min(4.0, numeric));
  return Math.round(clamped * 100) / 100;
};

const normalizeReaderMagnifierHoldDurationMs = (value: number | null | undefined): number =>
  clampInt(value ?? 450, 200, 700);

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

const normalizeReaderMagnifierSourceIds = (value: unknown): string[] => {
  const normalized = normalizeSourceIds(value);
  if (normalized.length > 0) {
    return normalized;
  }
  return [DEFAULT_MAGNIFIER_SOURCE_ID];
};

const mapSettings = (params: {
  appRow: typeof appSettings.$inferSelect;
  globalRow: typeof globalSearchSettings.$inferSelect;
}): AppSettings => ({
  allowNsfwSources: Boolean(params.appRow.allowNsfwSources),
  defaultReaderMode: normalizeReaderDefaultMode(params.appRow.defaultReaderMode),
  webtoonWindowAhead: normalizeWebtoonWindowAhead(params.appRow.webtoonWindowAhead),
  webtoonWindowBehind: normalizeWebtoonWindowBehind(params.appRow.webtoonWindowBehind),
  webtoonForegroundConcurrency: normalizeWebtoonForegroundConcurrency(
    params.appRow.webtoonForegroundConcurrency
  ),
  webtoonBackgroundConcurrency: normalizeWebtoonBackgroundConcurrency(
    params.appRow.webtoonBackgroundConcurrency
  ),
  webtoonChapterPreloadLeadPages: normalizeWebtoonChapterPreloadLeadPages(
    params.appRow.webtoonChapterPreloadLeadPages
  ),
  readerMagnifierEnabled: normalizeReaderMagnifierEnabled(params.appRow.readerMagnifierEnabled),
  readerMagnifierBubbleSize: normalizeReaderMagnifierBubbleSize(
    params.appRow.readerMagnifierBubbleSize
  ),
  readerMagnifierZoomScale: normalizeReaderMagnifierZoomScale(
    params.appRow.readerMagnifierZoomScale
  ),
  readerMagnifierHoldDurationMs: normalizeReaderMagnifierHoldDurationMs(
    params.appRow.readerMagnifierHoldDurationMs
  ),
  readerMagnifierSelectedSourceIds: normalizeReaderMagnifierSourceIds(
    parseSourceIdsJson(params.appRow.readerMagnifierSelectedSourceIdsJson)
  ),
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
      webtoonWindowAhead: 6,
      webtoonWindowBehind: 1,
      webtoonForegroundConcurrency: 1,
      webtoonBackgroundConcurrency: 1,
      webtoonChapterPreloadLeadPages: 4,
      readerMagnifierEnabled: true,
      readerMagnifierBubbleSize: 180,
      readerMagnifierZoomScale: 2.2,
      readerMagnifierHoldDurationMs: 450,
      readerMagnifierSelectedSourceIdsJson: JSON.stringify([DEFAULT_MAGNIFIER_SOURCE_ID]),
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
      webtoonWindowAhead: 6,
      webtoonWindowBehind: 1,
      webtoonForegroundConcurrency: 1,
      webtoonBackgroundConcurrency: 1,
      webtoonChapterPreloadLeadPages: 4,
      readerMagnifierEnabled: true,
      readerMagnifierBubbleSize: 180,
      readerMagnifierZoomScale: 2.2,
      readerMagnifierHoldDurationMs: 450,
      readerMagnifierSelectedSourceIds: [DEFAULT_MAGNIFIER_SOURCE_ID],
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
      webtoonWindowAhead: normalizeWebtoonWindowAhead(
        input.webtoonWindowAhead ?? current.webtoonWindowAhead
      ),
      webtoonWindowBehind: normalizeWebtoonWindowBehind(
        input.webtoonWindowBehind ?? current.webtoonWindowBehind
      ),
      webtoonForegroundConcurrency: normalizeWebtoonForegroundConcurrency(
        input.webtoonForegroundConcurrency ?? current.webtoonForegroundConcurrency
      ),
      webtoonBackgroundConcurrency: normalizeWebtoonBackgroundConcurrency(
        input.webtoonBackgroundConcurrency ?? current.webtoonBackgroundConcurrency
      ),
      webtoonChapterPreloadLeadPages: normalizeWebtoonChapterPreloadLeadPages(
        input.webtoonChapterPreloadLeadPages ?? current.webtoonChapterPreloadLeadPages
      ),
      readerMagnifierEnabled: normalizeReaderMagnifierEnabled(
        input.readerMagnifierEnabled ?? current.readerMagnifierEnabled
      ),
      readerMagnifierBubbleSize: normalizeReaderMagnifierBubbleSize(
        input.readerMagnifierBubbleSize ?? current.readerMagnifierBubbleSize
      ),
      readerMagnifierZoomScale: normalizeReaderMagnifierZoomScale(
        input.readerMagnifierZoomScale ?? current.readerMagnifierZoomScale
      ),
      readerMagnifierHoldDurationMs: normalizeReaderMagnifierHoldDurationMs(
        input.readerMagnifierHoldDurationMs ?? current.readerMagnifierHoldDurationMs
      ),
      readerMagnifierSelectedSourceIdsJson: JSON.stringify(
        normalizeReaderMagnifierSourceIds(
          input.readerMagnifierSelectedSourceIds ?? current.readerMagnifierSelectedSourceIds
        )
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
