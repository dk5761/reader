export type ReaderDefaultMode = "vertical";

export interface AppSettings {
  allowNsfwSources: boolean;
  defaultReaderMode: ReaderDefaultMode;
  webtoonWindowAhead: number;
  webtoonWindowBehind: number;
  webtoonForegroundConcurrency: number;
  webtoonBackgroundConcurrency: number;
  webtoonChapterPreloadLeadPages: number;
  readerMagnifierEnabled: boolean;
  readerMagnifierBubbleSize: number;
  readerMagnifierZoomScale: number;
  readerMagnifierHoldDurationMs: number;
  readerMagnifierSelectedSourceIds: string[];
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
  readerMagnifierEnabled?: boolean;
  readerMagnifierBubbleSize?: number;
  readerMagnifierZoomScale?: number;
  readerMagnifierHoldDurationMs?: number;
  readerMagnifierSelectedSourceIds?: string[];
  globalSearchSelectedSourceIds?: string[];
}
