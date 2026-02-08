import { drizzle } from "drizzle-orm/expo-sqlite";
import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";
import { DATABASE_BOOTSTRAP_SQL } from "./migrations";
import * as schema from "./schema";

const DATABASE_NAME = "reader.db";

const sqliteDatabase = openDatabaseSync(DATABASE_NAME);
const drizzleDatabase = drizzle(sqliteDatabase, { schema });

let isDatabaseInitialized = false;

export const initializeDatabase = (): void => {
  if (isDatabaseInitialized) {
    return;
  }

  sqliteDatabase.execSync(DATABASE_BOOTSTRAP_SQL);
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
