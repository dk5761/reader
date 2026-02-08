import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { Text, View } from "react-native";
import { useLibraryUpdateStore } from "@/services/library-update";
import { libraryQueryFactory } from "@/services/library";
import { ActionPillButton } from "@/shared/ui";
import {
  recentLibraryUpdateEventsQueryOptions,
  useCancelLibraryUpdateMutation,
  usePauseLibraryUpdateMutation,
  useResumeLibraryUpdateMutation,
  useStartLibraryUpdateMutation,
} from "../api";
import { libraryUpdateQueryFactory } from "../api/libraryUpdate.queryFactory";

const RECENT_EVENTS_LIMIT = 6;

const formatEventTime = (timestamp: number): string => {
  const deltaMs = Date.now() - timestamp;
  const deltaMinutes = Math.floor(deltaMs / 60000);
  if (deltaMinutes < 1) {
    return "Just now";
  }
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }
  return new Date(timestamp).toLocaleDateString();
};

export const LibraryUpdateCard = () => {
  const queryClient = useQueryClient();
  const runSnapshot = useLibraryUpdateStore((state) => state.snapshot);

  const startMutation = useStartLibraryUpdateMutation();
  const pauseMutation = usePauseLibraryUpdateMutation();
  const resumeMutation = useResumeLibraryUpdateMutation();
  const cancelMutation = useCancelLibraryUpdateMutation();

  const eventsQuery = useQuery({
    ...recentLibraryUpdateEventsQueryOptions(RECENT_EVENTS_LIMIT),
    refetchInterval:
      runSnapshot.status === "running" || runSnapshot.status === "paused" ? 1500 : false,
  });

  const previousStatusRef = useRef(runSnapshot.status);
  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = runSnapshot.status;

    const wasInFlight = previousStatus === "running" || previousStatus === "paused";
    const nowFinished =
      runSnapshot.status === "completed" ||
      runSnapshot.status === "cancelled" ||
      runSnapshot.status === "failed";

    if (!wasInFlight || !nowFinished) {
      return;
    }

    void Promise.all([
      queryClient.invalidateQueries({ queryKey: libraryQueryFactory.all() }),
      queryClient.invalidateQueries({ queryKey: libraryUpdateQueryFactory.all() }),
    ]);
  }, [queryClient, runSnapshot.status]);

  const isMutationPending =
    startMutation.isPending ||
    pauseMutation.isPending ||
    resumeMutation.isPending ||
    cancelMutation.isPending;

  const progressRatio = useMemo(() => {
    if (runSnapshot.total <= 0) {
      return runSnapshot.status === "completed" ? 1 : 0;
    }
    return Math.min(1, runSnapshot.processed / runSnapshot.total);
  }, [runSnapshot.processed, runSnapshot.status, runSnapshot.total]);

  const primaryAction = useMemo(() => {
    if (runSnapshot.status === "running") {
      return {
        label: "Pause",
        onPress: () => pauseMutation.mutate(),
      };
    }
    if (runSnapshot.status === "paused") {
      return {
        label: "Resume",
        onPress: () => resumeMutation.mutate(),
      };
    }
    return {
      label: "Update Library",
      onPress: () => startMutation.mutate(),
    };
  }, [
    pauseMutation,
    resumeMutation,
    runSnapshot.status,
    startMutation,
  ]);

  return (
    <View className="mt-3 rounded-xl border border-[#2A2A2E] bg-[#1A1B1E] p-4">
      <Text className="text-base font-semibold text-white">Library Updates</Text>
      <Text className="mt-1 text-xs text-[#9B9CA6]">
        Refresh saved manga metadata and detect new chapter updates.
      </Text>

      <View className="mt-3 flex-row items-center gap-2">
        <ActionPillButton
          compact
          label={primaryAction.label}
          onPress={() => {
            if (isMutationPending) {
              return;
            }
            primaryAction.onPress();
          }}
        />

        {(runSnapshot.status === "running" || runSnapshot.status === "paused") && (
          <ActionPillButton
            compact
            label="Cancel"
            onPress={() => {
              if (isMutationPending) {
                return;
              }
              cancelMutation.mutate();
            }}
          />
        )}
      </View>

      <View className="mt-3 rounded-lg border border-[#2A2A2E] bg-[#141519] p-3">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs text-[#C8C9D2]">
            {runSnapshot.processed} / {runSnapshot.total}
          </Text>
          <Text
            className={`text-xs font-semibold ${
              runSnapshot.status === "running"
                ? "text-[#67A4FF]"
                : runSnapshot.status === "paused"
                  ? "text-[#E3C67B]"
                  : runSnapshot.status === "completed"
                    ? "text-[#7BEEB0]"
                    : runSnapshot.status === "failed"
                      ? "text-[#F3B7B7]"
                      : "text-[#9B9CA6]"
            }`}
          >
            {runSnapshot.status.toUpperCase()}
          </Text>
        </View>

        <View className="mt-2 h-2 overflow-hidden rounded-full bg-[#202127]">
          <View
            className="h-full rounded-full bg-[#67A4FF]"
            style={{ width: `${Math.max(0, Math.min(100, progressRatio * 100))}%` }}
          />
        </View>

        <View className="mt-2 flex-row items-center justify-between">
          <Text className="text-xs text-[#9B9CA6]">Updated {runSnapshot.updated}</Text>
          <Text className="text-xs text-[#9B9CA6]">Skipped {runSnapshot.skipped}</Text>
          <Text className="text-xs text-[#9B9CA6]">Errors {runSnapshot.errors}</Text>
        </View>

        {runSnapshot.current ? (
          <Text className="mt-2 text-xs text-[#D0D1D8]" numberOfLines={1}>
            Updating: {runSnapshot.current.title}
          </Text>
        ) : null}

        {runSnapshot.errorMessage ? (
          <Text className="mt-2 text-xs text-[#F3B7B7]">{runSnapshot.errorMessage}</Text>
        ) : null}
      </View>

      <View className="mt-3">
        <Text className="text-sm font-medium text-white">Recent detections</Text>

        {eventsQuery.isPending ? (
          <Text className="mt-2 text-xs text-[#9B9CA6]">Loading update events...</Text>
        ) : eventsQuery.data && eventsQuery.data.length > 0 ? (
          <View className="mt-2 gap-2">
            {eventsQuery.data.map((event) => (
              <View key={event.id} className="rounded-lg border border-[#25262A] bg-[#141519] p-2.5">
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="flex-1 text-xs font-semibold text-[#E6E7EB]" numberOfLines={1}>
                    {event.mangaTitle}
                  </Text>
                  <Text className="text-[11px] font-semibold text-[#7BEEB0]">
                    +{event.chapterDelta}
                  </Text>
                </View>
                <Text className="mt-1 text-[11px] text-[#9B9CA6]">
                  {event.detectionMode === "date" ? "Date" : "Count fallback"} •{" "}
                  {formatEventTime(event.detectedAt)}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text className="mt-2 text-xs text-[#9B9CA6]">No updates detected yet.</Text>
        )}
      </View>
    </View>
  );
};
