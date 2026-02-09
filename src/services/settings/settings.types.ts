export type ReaderDefaultMode = "vertical" | "horizontal";

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
