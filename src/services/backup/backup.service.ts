import { documentDirectory, EncodingType, deleteAsync, getInfoAsync, makeDirectoryAsync, readAsStringAsync, readDirectoryAsync, writeAsStringAsync } from "expo-file-system/legacy";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { exportDatabase } from "./backup.repository";
import { importDatabase } from "./restore.service";
import type { BackupData } from "./backup.types";

const BACKUP_FOLDER = `${documentDirectory}backups/`;

const ensureBackupFolder = async (): Promise<void> => {
  const dirInfo = await getInfoAsync(BACKUP_FOLDER);
  if (!dirInfo.exists) {
    await makeDirectoryAsync(BACKUP_FOLDER, { intermediates: true });
  }
};

export const createBackup = async (): Promise<string> => {
  await ensureBackupFolder();

  const backupData = exportDatabase();
  const jsonString = JSON.stringify(backupData, null, 2);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `backup-${timestamp}.json`;
  const filePath = `${BACKUP_FOLDER}${filename}`;

  await writeAsStringAsync(filePath, jsonString, {
    encoding: EncodingType.UTF8,
  });

  return filePath;
};

export const readBackupFile = async (uri: string): Promise<BackupData> => {
  const response = await readAsStringAsync(uri, {
    encoding: EncodingType.UTF8,
  });
  return JSON.parse(response) as BackupData;
};

export const restoreFromFile = async (uri: string): Promise<void> => {
  const backupData = await readBackupFile(uri);
  importDatabase(backupData);
};

export const pickBackupFile = async (): Promise<DocumentPicker.DocumentPickerResult> => {
  return DocumentPicker.getDocumentAsync({
    type: "application/json",
    copyToCacheDirectory: true,
  });
};

export const shareBackupFile = async (filePath: string): Promise<void> => {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error("Sharing is not available on this device");
  }
  await Sharing.shareAsync(filePath, {
    mimeType: "application/json",
    dialogTitle: "Share Backup",
    UTI: "public.json",
  });
};

export const getBackupSize = async (filePath: string): Promise<number> => {
  const fileInfo = await getInfoAsync(filePath);
  if (fileInfo.exists && "size" in fileInfo) {
    return fileInfo.size ?? 0;
  }
  return 0;
};

export const listBackups = async (): Promise<string[]> => {
  await ensureBackupFolder();
  const files = await readDirectoryAsync(BACKUP_FOLDER);
  return files
    .filter((file) => file.endsWith(".json"))
    .map((file) => `${BACKUP_FOLDER}${file}`)
    .sort()
    .reverse();
};

export const deleteBackup = async (filePath: string): Promise<void> => {
  await deleteAsync(filePath, { idempotent: true });
};

export const getLatestBackup = async (): Promise<string | null> => {
  const backups = await listBackups();
  return backups[0] ?? null;
};
