import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Button, Spinner } from "heroui-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { libraryQueryFactory } from "@/services/library";
import { getLibraryUpdateRunSnapshot } from "@/services/library-update";
import { useSource } from "@/services/source";
import { ActionPillButton, CenteredState, ScreenHeader } from "@/shared/ui";
import {
  updatesEventsInfiniteQueryOptions,
  updatesFeedStateQueryOptions,
  updatesRunSnapshotQueryOptions,
  useCancelLibraryUpdateRunMutation,
  useMarkLibraryUpdatesSeenMutation,
  usePauseLibraryUpdateRunMutation,
  useResumeLibraryUpdateRunMutation,
  useStartLibraryUpdateRunMutation,
} from "../api";
import { updatesQueryFactory } from "../api/updates.queryFactory";
import { LibraryUpdateRunCard } from "../components/LibraryUpdateRunCard";
import { UpdateEventCard } from "../components/UpdateEventCard";
import { UpdatesFilterSheet } from "../components/UpdatesFilterSheet";

const EVENTS_PAGE_SIZE = 30;

export default function UpdatesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  const { sources } = useSource();

  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [todayOnly, setTodayOnly] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const startMutation = useStartLibraryUpdateRunMutation();
  const pauseMutation = usePauseLibraryUpdateRunMutation();
  const resumeMutation = useResumeLibraryUpdateRunMutation();
  const cancelMutation = useCancelLibraryUpdateRunMutation();
  const markSeenMutation = useMarkLibraryUpdatesSeenMutation();

  const runSnapshotQuery = useQuery({
    ...updatesRunSnapshotQueryOptions(),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "running" || status === "paused" ? 1500 : false;
    },
  });

  const runSnapshot = runSnapshotQuery.data ?? getLibraryUpdateRunSnapshot();

  const feedStateQuery = useQuery(updatesFeedStateQueryOptions());

  const eventsQuery = useInfiniteQuery({
    ...updatesEventsInfiniteQueryOptions({
      sourceId: selectedSourceId ?? undefined,
      todayOnly,
      unreadOnly,
      lastSeenEventId: feedStateQuery.data?.lastSeenEventId ?? null,
      pageSize: EVENTS_PAGE_SIZE,
      enabled: !unreadOnly || feedStateQuery.isSuccess,
    }),
    refetchInterval:
      runSnapshot.status === "running" || runSnapshot.status === "paused" ? 1500 : false,
  });

  const allowedSourceIds = useMemo(
    () => new Set(sources.map((source) => source.id)),
    [sources]
  );
  const sourceNameById = useMemo(
    () => new Map(sources.map((source) => [source.id, source.name])),
    [sources]
  );

  useEffect(() => {
    if (selectedSourceId && !allowedSourceIds.has(selectedSourceId)) {
      setSelectedSourceId(null);
    }
  }, [allowedSourceIds, selectedSourceId]);

  const allEvents = useMemo(
    () => eventsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [eventsQuery.data]
  );

  const visibleEvents = useMemo(
    () => allEvents.filter((event) => allowedSourceIds.has(event.sourceId)),
    [allEvents, allowedSourceIds]
  );

  const isActionPending =
    startMutation.isPending ||
    pauseMutation.isPending ||
    resumeMutation.isPending ||
    cancelMutation.isPending;

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
      queryClient.invalidateQueries({ queryKey: updatesQueryFactory.all() }),
    ]);
  }, [queryClient, runSnapshot.status]);

  const markSeenIfNeeded = useCallback(() => {
    if (markSeenMutation.isPending) {
      return;
    }

    markSeenMutation.mutate();
  }, [markSeenMutation]);

  const wasFocusedRef = useRef(isFocused);
  useEffect(() => {
    if (wasFocusedRef.current && !isFocused) {
      markSeenIfNeeded();
    }

    wasFocusedRef.current = isFocused;
  }, [isFocused, markSeenIfNeeded]);

  useEffect(
    () => () => {
      if (wasFocusedRef.current) {
        markSeenIfNeeded();
      }
    },
    [markSeenIfNeeded]
  );

  const emptyMessage = useMemo(() => {
    if (eventsQuery.isPending) {
      return "Loading updates...";
    }

    if (unreadOnly) {
      return "No unread updates.";
    }

    if (todayOnly) {
      return selectedSourceId ? "No updates for this source today." : "No updates today.";
    }

    if (selectedSourceId) {
      return "No updates for this source.";
    }

    return "No updates detected yet.";
  }, [eventsQuery.isPending, selectedSourceId, todayOnly, unreadOnly]);

  if (runSnapshotQuery.isError) {
    return (
      <CenteredState
        withBackground={false}
        title="Could not load updates"
        message={runSnapshotQuery.error.message}
      >
        <View className="mt-4">
          <ActionPillButton
            label="Retry"
            onPress={() => {
              void runSnapshotQuery.refetch();
            }}
          />
        </View>
      </CenteredState>
    );
  }

  return (
    <View className="flex-1 bg-[#111214]">
      <View className="px-4 pb-3 pt-2">
        <ScreenHeader
          title="Updates"
          subtitle="Detected library updates."
          onBackPress={() => router.back()}
          rightAccessory={
            <Button
              isIconOnly
              size="sm"
              variant="secondary"
              className="rounded-full"
              onPress={() => setIsFilterSheetOpen(true)}
              pressableFeedbackVariant="none"
            >
              <Ionicons name="options-outline" size={18} color="#C8C9D2" />
            </Button>
          }
        />
      </View>

      <FlatList
        data={visibleEvents}
        keyExtractor={(item) => String(item.id)}
        contentContainerClassName="px-4 pb-8"
        ItemSeparatorComponent={() => <View className="h-2" />}
        ListHeaderComponent={
          <View className="pb-3">
            <LibraryUpdateRunCard
              snapshot={runSnapshot}
              isActionPending={isActionPending}
              onStart={() => startMutation.mutate()}
              onPause={() => pauseMutation.mutate()}
              onResume={() => resumeMutation.mutate()}
              onCancel={() => cancelMutation.mutate()}
            />

            <View className="mt-3 flex-row items-center gap-2">
              <Text className="text-xs text-[#9B9CA6]">Filters:</Text>
              <Text className="text-xs text-[#C8C9D2]">
                {selectedSourceId
                  ? sourceNameById.get(selectedSourceId) ?? selectedSourceId
                  : "All Sources"}
                {todayOnly ? " • Today" : ""}
                {unreadOnly ? " • Unread" : ""}
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <UpdateEventCard
            event={item}
            sourceName={sourceNameById.get(item.sourceId) ?? item.sourceId}
            onPress={() => {
              router.push({
                pathname: "/manga/[sourceId]/[mangaId]",
                params: {
                  sourceId: item.sourceId,
                  mangaId: item.mangaId,
                },
              });
            }}
          />
        )}
        ListEmptyComponent={
          <View className="items-center py-10">
            {eventsQuery.isPending ? (
              <Spinner size="sm" color="#67A4FF" />
            ) : null}
            <Text className="mt-2 text-center text-sm text-[#9B9CA6]">{emptyMessage}</Text>
          </View>
        }
        ListFooterComponent={
          eventsQuery.hasNextPage ? (
            <View className="items-center pt-3">
              {eventsQuery.isFetchingNextPage ? (
                <Spinner size="sm" color="#67A4FF" />
              ) : (
                <ActionPillButton
                  label="Load More"
                  onPress={() => {
                    void eventsQuery.fetchNextPage();
                  }}
                />
              )}
            </View>
          ) : null
        }
      />

      <UpdatesFilterSheet
        isOpen={isFilterSheetOpen}
        onOpenChange={setIsFilterSheetOpen}
        sources={sources.map((source) => ({ id: source.id, name: source.name }))}
        selectedSourceId={selectedSourceId}
        onSelectSource={setSelectedSourceId}
        todayOnly={todayOnly}
        onToggleToday={() => setTodayOnly((current) => !current)}
        unreadOnly={unreadOnly}
        onToggleUnread={() => setUnreadOnly((current) => !current)}
      />
    </View>
  );
}
