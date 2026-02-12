import Constants from "expo-constants";
import {
  getDatabase,
  libraryCategories,
  libraryEntries,
  libraryEntryCategories,
  libraryUpdateEvents,
  libraryUpdateState,
  libraryViewSettings,
  readingHistory,
  readingHistoryEvents,
  readingProgress,
  appSettings,
  globalSearchSettings,
} from "@/services/db";
import type { BackupData } from "./backup.types";

const getAllLibraryEntries = () => {
  const db = getDatabase();
  return db.select().from(libraryEntries).all();
};

const getAllCategories = () => {
  const db = getDatabase();
  return db.select().from(libraryCategories).all();
};

const getAllEntryCategories = () => {
  const db = getDatabase();
  return db.select().from(libraryEntryCategories).all();
};

const getLibraryViewSettings = () => {
  const db = getDatabase();
  const settings = db.select().from(libraryViewSettings).all();
  return settings;
};

const getAllProgress = () => {
  const db = getDatabase();
  return db.select().from(readingProgress).all();
};

const getAllHistory = () => {
  const db = getDatabase();
  return db.select().from(readingHistory).all();
};

const getAllHistoryEvents = () => {
  const db = getDatabase();
  return db.select().from(readingHistoryEvents).all();
};

const getAppSettings = () => {
  const db = getDatabase();
  const settings = db.select().from(appSettings).all();
  return settings;
};

const getGlobalSearchSettings = () => {
  const db = getDatabase();
  const settings = db.select().from(globalSearchSettings).all();
  return settings;
};

const getAllLibraryUpdateState = () => {
  const db = getDatabase();
  return db.select().from(libraryUpdateState).all();
};

const getAllLibraryUpdateEvents = () => {
  const db = getDatabase();
  return db.select().from(libraryUpdateEvents).all();
};

export const exportDatabase = (): BackupData => {
  const version = Constants.expoConfig?.version ?? "1.0.0";
  const createdAt = new Date().toISOString();

  const tables: BackupData["tables"] = {
    library_entries: getAllLibraryEntries(),
    library_categories: getAllCategories(),
    library_entry_categories: getAllEntryCategories(),
    library_view_settings: getLibraryViewSettings(),
    reading_progress: getAllProgress(),
    reading_history: getAllHistory(),
    reading_history_events: getAllHistoryEvents(),
    app_settings: getAppSettings(),
    global_search_settings: getGlobalSearchSettings(),
    library_update_state: getAllLibraryUpdateState(),
    library_update_events: getAllLibraryUpdateEvents(),
  };

  return {
    version,
    createdAt,
    tables,
  };
};
