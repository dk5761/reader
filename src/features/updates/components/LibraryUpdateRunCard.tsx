import { useMemo } from "react";
import { Text, View } from "react-native";
import type { LibraryUpdateRunSnapshot } from "@/services/library-update";
import { ActionPillButton } from "@/shared/ui";

interface LibraryUpdateRunCardProps {
  snapshot: LibraryUpdateRunSnapshot;
  isActionPending: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}

export const LibraryUpdateRunCard = ({
  snapshot,
  isActionPending,
  onStart,
  onPause,
  onResume,
  onCancel,
}: LibraryUpdateRunCardProps) => {
  const progressRatio = useMemo(() => {
    if (snapshot.total <= 0) {
      return snapshot.status === "completed" ? 1 : 0;
    }
    return Math.min(1, snapshot.processed / snapshot.total);
  }, [snapshot.processed, snapshot.status, snapshot.total]);

  const primaryAction = useMemo(() => {
    if (snapshot.status === "running") {
      return { label: "Pause", onPress: onPause };
    }

    if (snapshot.status === "paused") {
      return { label: "Resume", onPress: onResume };
    }

    return { label: "Update Library", onPress: onStart };
  }, [onPause, onResume, onStart, snapshot.status]);

  return (
    <View className="rounded-xl border border-[#2A2A2E] bg-[#1A1B1E] p-4">
      <Text className="text-base font-semibold text-white">Library Updates</Text>
      <Text className="mt-1 text-xs text-[#9B9CA6]">
        Refresh saved manga metadata and detect new chapter updates.
      </Text>

      <View className="mt-3 flex-row items-center gap-2">
        <ActionPillButton
          compact
          label={primaryAction.label}
          onPress={() => {
            if (isActionPending) {
              return;
            }
            primaryAction.onPress();
          }}
        />

        {(snapshot.status === "running" || snapshot.status === "paused") && (
          <ActionPillButton
            compact
            label="Cancel"
            onPress={() => {
              if (isActionPending) {
                return;
              }
              onCancel();
            }}
          />
        )}
      </View>

      <View className="mt-3 rounded-lg border border-[#2A2A2E] bg-[#141519] p-3">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs text-[#C8C9D2]">
            {snapshot.processed} / {snapshot.total}
          </Text>
          <Text
            className={`text-xs font-semibold ${
              snapshot.status === "running"
                ? "text-[#67A4FF]"
                : snapshot.status === "paused"
                  ? "text-[#E3C67B]"
                  : snapshot.status === "completed"
                    ? "text-[#7BEEB0]"
                    : snapshot.status === "failed"
                      ? "text-[#F3B7B7]"
                      : "text-[#9B9CA6]"
            }`}
          >
            {snapshot.status.toUpperCase()}
          </Text>
        </View>

        <View className="mt-2 h-2 overflow-hidden rounded-full bg-[#202127]">
          <View
            className="h-full rounded-full bg-[#67A4FF]"
            style={{ width: `${Math.max(0, Math.min(100, progressRatio * 100))}%` }}
          />
        </View>

        <View className="mt-2 flex-row items-center justify-between">
          <Text className="text-xs text-[#9B9CA6]">Updated {snapshot.updated}</Text>
          <Text className="text-xs text-[#9B9CA6]">Skipped {snapshot.skipped}</Text>
          <Text className="text-xs text-[#9B9CA6]">Errors {snapshot.errors}</Text>
        </View>

        {snapshot.current ? (
          <Text className="mt-2 text-xs text-[#D0D1D8]" numberOfLines={1}>
            Updating: {snapshot.current.title}
          </Text>
        ) : null}

        {snapshot.errorMessage ? (
          <Text className="mt-2 text-xs text-[#F3B7B7]">{snapshot.errorMessage}</Text>
        ) : null}
      </View>
    </View>
  );
};
