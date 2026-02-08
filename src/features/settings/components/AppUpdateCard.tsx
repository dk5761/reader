import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Text, View } from "react-native";
import { useAppUpdateStore } from "@/services/app-update";
import { ActionPillButton } from "@/shared/ui";
import {
  appUpdateSnapshotQueryOptions,
  useApplyDownloadedUpdateMutation,
  useCheckForAppUpdateMutation,
} from "../api";

const formatLastChecked = (timestamp?: number): string => {
  if (!timestamp) {
    return "Never";
  }
  return new Date(timestamp).toLocaleTimeString();
};

export const AppUpdateCard = () => {
  useQuery(appUpdateSnapshotQueryOptions());
  const snapshot = useAppUpdateStore((state) => state.snapshot);
  const checkUpdateMutation = useCheckForAppUpdateMutation();
  const applyUpdateMutation = useApplyDownloadedUpdateMutation();

  const statusLabel = useMemo(() => {
    switch (snapshot.status) {
      case "idle":
        return "Idle";
      case "checking":
        return "Checking for updates...";
      case "downloading":
        return "Downloading update...";
      case "ready":
        return "Update ready";
      case "up_to_date":
        return "Up to date";
      case "error":
        return "Update check failed";
      default:
        return "Idle";
    }
  }, [snapshot.status]);

  const isCheckDisabled =
    snapshot.isChecking || snapshot.isApplying || checkUpdateMutation.isPending;
  const isReloadDisabled =
    !snapshot.isUpdateReady || snapshot.isApplying || applyUpdateMutation.isPending;

  return (
    <View className="mt-3 rounded-xl border border-[#2A2A2E] bg-[#1A1B1E] p-4">
      <Text className="text-base font-semibold text-white">App Updates</Text>
      <Text className="mt-1 text-xs text-[#9B9CA6]">
        Check for production OTA updates and restart when ready.
      </Text>

      <View className="mt-3 rounded-lg border border-[#2A2A2E] bg-[#141519] p-3">
        <Text className="text-sm font-medium text-white">{statusLabel}</Text>
        <Text className="mt-1 text-xs text-[#9B9CA6]">
          Last checked: {formatLastChecked(snapshot.lastCheckedAt)}
        </Text>
        {snapshot.errorMessage ? (
          <Text className="mt-2 text-xs text-[#F3B7B7]">{snapshot.errorMessage}</Text>
        ) : null}
      </View>

      <View className="mt-3 flex-row flex-wrap gap-2">
        <ActionPillButton
          compact
          label={snapshot.isChecking ? "Checking..." : "Check for Updates"}
          onPress={() => {
            if (isCheckDisabled) {
              return;
            }
            checkUpdateMutation.mutate();
          }}
        />

        {snapshot.isUpdateReady ? (
          <ActionPillButton
            compact
            label={snapshot.isApplying ? "Restarting..." : "Restart Now"}
            onPress={() => {
              if (isReloadDisabled) {
                return;
              }
              applyUpdateMutation.mutate();
            }}
          />
        ) : null}
      </View>
    </View>
  );
};
