export type ReaderDefaultMode = "vertical";

export interface AppSettings {
  allowNsfwSources: boolean;
  defaultReaderMode: ReaderDefaultMode;
  webtoonWindowAhead: number;
  webtoonWindowBehind: number;
  webtoonForegroundConcurrency: number;
  webtoonBackgroundConcurrency: number;
  webtoonChapterPreloadLeadPages: number;
  globalSearchSelectedSourceIds: string[];
  updatedAt: number;
}

export interface UpdateAppSettingsInput {
  allowNsfwSources?: boolean;
  defaultReaderMode?: ReaderDefaultMode;
  webtoonWindowAhead?: number;
  webtoonWindowBehind?: number;
  webtoonForegroundConcurrency?: number;
  webtoonBackgroundConcurrency?: number;
  webtoonChapterPreloadLeadPages?: number;
  globalSearchSelectedSourceIds?: string[];
}
