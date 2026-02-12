import {
  createBackup,
  deleteBackup,
  getBackupSize,
  listBackups,
  pickBackupFile,
  restoreFromFile,
  shareBackupFile,
} from "@/services/backup";
import { ScreenHeader } from "@/shared/ui";
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";

interface BackupInfo {
  path: string;
  createdAt: string;
  size: number;
  entries: number;
  categories: number;
  progress: number;
  history: number;
}

interface StatusMessage {
  type: "success" | "error";
  message: string;
}

export default function BackupScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(true);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);

  const loadBackups = async () => {
    setIsLoadingBackups(true);
    try {
      const backupPaths = await listBackups();
      const backupInfos: BackupInfo[] = [];

      for (const path of backupPaths) {
        try {
          const size = await getBackupSize(path);
          const filename = path.split("/").pop() || "";
          backupInfos.push({
            path,
            createdAt: filename
              .replace("backup-", "")
              .replace(".json", "")
              .replace(/-/g, " "),
            size,
            entries: 0,
            categories: 0,
            progress: 0,
            history: 0,
          });
        } catch {
          // Skip invalid backups
        }
      }

      setBackups(backupInfos);
    } catch (error) {
      console.error("Failed to load backups:", error);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  useEffect(() => {
    loadBackups();
  }, []);

  const showStatus = (type: "success" | "error", message: string) => {
    setStatusMessage({ type, message });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleExport = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const filePath = await createBackup();
      const size = await getBackupSize(filePath);
      await loadBackups();
      showStatus(
        "success",
        `Backup created (${formatFileSize(size)}). It will appear in "Saved Backups" below.`,
      );
    } catch (error) {
      showStatus("error", "Failed to create backup. Please try again.");
      console.error("Backup error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    if (isLoading) return;
    try {
      const result = await pickBackupFile();

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      if (!asset.uri) {
        return;
      }

      setIsLoading(true);
      await restoreFromFile(asset.uri!);
      showStatus("success", "Data restored successfully!");
    } catch (error) {
      showStatus("error", "Failed to restore backup. The file may be corrupted.");
      console.error("Restore error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteBackup = (backup: BackupInfo) => {
    try {
      deleteBackup(backup.path);
      loadBackups();
      showStatus("success", "Backup deleted.");
    } catch (error) {
      showStatus("error", "Failed to delete backup.");
    }
  };

  const handleShareBackup = async (backup: BackupInfo) => {
    try {
      await shareBackupFile(backup.path);
    } catch (error) {
      showStatus("error", "Failed to share backup.");
    }
  };

  return (
    <View className="flex-1 bg-[#111214]">
      <Stack.Screen options={{ headerShown: false }} />
      <View className="px-4 pb-3 pt-2">
        <ScreenHeader
          title="Backup & Restore"
          subtitle="Export or import your library data."
          onBackPress={() => router.back()}
        />
      </View>

      {statusMessage && (
        <View
          className={`mx-4 mb-2 rounded-lg p-3 ${
            statusMessage.type === "success"
              ? "bg-[#1A3A2A]"
              : "bg-[#3A1A1A]"
          }`}
        >
          <Text
            className={`text-sm ${
              statusMessage.type === "success" ? "text-[#7AB89A]" : "text-[#E88A8A]"
            }`}
          >
            {statusMessage.message}
          </Text>
        </View>
      )}

      <ScrollView
        contentContainerClassName="px-4 pb-8"
        showsVerticalScrollIndicator={false}
      >
        <View className="rounded-xl border border-[#2A2A2E] bg-[#1A1B1E] p-4">
          <Text className="text-base font-semibold text-white">
            Create Backup
          </Text>
          <Text className="mt-1 text-xs text-[#9B9CA6]">
            Export all your library entries, categories, reading progress, and
            settings to a JSON file.
          </Text>

          <View className="mt-4 flex-row gap-2">
            <TouchableOpacity
              onPress={handleExport}
              disabled={isLoading}
              className={`rounded-full px-4 py-2 ${
                isLoading ? "bg-[#2A3A4A]" : "bg-[#3A4A5A]"
              }`}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#9B9CA6" />
              ) : (
                <Text className="text-sm font-medium text-white">
                  Export Backup
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View className="mt-3 rounded-xl border border-[#2A2A2E] bg-[#1A1B1E] p-4">
          <Text className="text-base font-semibold text-white">
            Restore Backup
          </Text>
          <Text className="mt-1 text-xs text-[#9B9CA6]">
            Import data from a backup file. Existing data will be updated.
          </Text>

          <View className="mt-4 flex-row gap-2">
            <TouchableOpacity
              onPress={handleImport}
              disabled={isLoading}
              className={`rounded-full px-4 py-2 ${
                isLoading ? "bg-[#2A3A4A]" : "bg-[#3A4A5A]"
              }`}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#9B9CA6" />
              ) : (
                <Text className="text-sm font-medium text-white">
                  Import Backup
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View className="mt-5 rounded-xl border border-[#2A2A2E] bg-[#1A1B1E] p-4">
          <Text className="text-base font-semibold text-white">
            Saved Backups
          </Text>
          <Text className="mt-1 text-xs text-[#9B9CA6]">
            Backups are stored in the app's documents folder. Use "Import
            Backup" to restore from a file.
          </Text>

          {isLoadingBackups ? (
            <View className="mt-4 py-4">
              <ActivityIndicator size="small" color="#9B9CA6" className="mx-auto" />
            </View>
          ) : backups.length === 0 ? (
            <View className="mt-4 py-4">
              <Text className="text-sm text-[#9B9CA6] text-center">
                No backups saved yet.
              </Text>
            </View>
          ) : (
            <View className="mt-3 space-y-2">
              {backups.map((backup) => (
                <View
                  key={backup.path}
                  className="flex-row items-center justify-between rounded-lg bg-[#252529] p-3"
                >
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-white">
                      {backup.createdAt}
                    </Text>
                    <Text className="text-xs text-[#9B9CA6]">
                      {formatFileSize(backup.size)}
                    </Text>
                  </View>
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      onPress={() => handleShareBackup(backup)}
                      className="rounded-full bg-[#3A4A5A] px-3 py-1.5"
                    >
                      <Text className="text-xs font-medium text-white">
                        Share
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteBackup(backup)}
                      className="rounded-full bg-[#5A3A3A] px-3 py-1.5"
                    >
                      <Text className="text-xs font-medium text-white">
                        Delete
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View className="mt-3 rounded-xl border border-[#2A2A2E] bg-[#1A1B1E] p-4">
          <Text className="text-xs text-[#9B9CA6]">
            Note: Cached images and cookies are not included in backups. These
            will be re-downloaded as needed.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
