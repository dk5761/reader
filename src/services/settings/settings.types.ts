export type ReaderDefaultMode = "vertical";

export interface AppSettings {
  allowNsfwSources: boolean;
  defaultReaderMode: ReaderDefaultMode;
  globalSearchSelectedSourceIds: string[];
  updatedAt: number;
}

export interface UpdateAppSettingsInput {
  allowNsfwSources?: boolean;
  defaultReaderMode?: ReaderDefaultMode;
  globalSearchSelectedSourceIds?: string[];
}
