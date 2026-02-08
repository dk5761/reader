export type ReaderDefaultMode = "vertical" | "horizontal";

export interface AppSettings {
  allowNsfwSources: boolean;
  defaultReaderMode: ReaderDefaultMode;
  updatedAt: number;
}

export interface UpdateAppSettingsInput {
  allowNsfwSources?: boolean;
  defaultReaderMode?: ReaderDefaultMode;
}
