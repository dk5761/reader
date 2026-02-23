import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Button } from "heroui-native";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  RefreshControl,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSource } from "@/services/source";
import type {
  LibrarySortDirection,
  LibrarySortKey,
  LibraryStatusFilter,
} from "@/services/library";
import {
  useBulkRemoveLibraryEntriesMutation,
  useUpdateLibraryViewSettingsMutation,
  libraryEntriesWithCategoriesQueryOptions,
  libraryViewSettingsQueryOptions,
} from "@/features/library/api";
import {
  LibraryBulkFab,
  LibraryEntryCard,
  LibraryFilterSheet,
} from "@/features/library/components";
import {
  CenteredLoadingState,
  CenteredState,
  ScreenHeader,
  ActionPillButton,
} from "@/shared/ui";

export default function LibraryScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const { sources } = useSource();
  const insets = useSafeAreaInsets();

  const settingsQuery = useQuery(libraryViewSettingsQueryOptions());
  const updateViewSettingsMutation = useUpdateLibraryViewSettingsMutation();
  const bulkRemoveMutation = useBulkRemoveLibraryEntriesMutation();

  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedEntryIds, setSelectedEntryIds] = useState<number[]>([]);

  const allowedSourceIds = useMemo(
    () => sources.map((source) => source.id),
    [sources]
  );
  const allowedSourceIdSet = useMemo(
    () => new Set(allowedSourceIds),
    [allowedSourceIds]
  );

  const normalizedSourceFilterIds = useMemo(() => {
    const sourceFilterIds = settingsQuery.data?.sourceFilterSourceIds ?? [];
    return sourceFilterIds.filter((id) => allowedSourceIdSet.has(id));
  }, [settingsQuery.data?.sourceFilterSourceIds, allowedSourceIdSet]);

  useEffect(() => {
    const settings = settingsQuery.data;
    if (!settings || updateViewSettingsMutation.isPending) {
      return;
    }

    const needsCategoryReset = settings.activeCategoryId !== null;
    const needsSourceFilterNormalization =
      settings.sourceFilterSourceIds.length !== normalizedSourceFilterIds.length;

    if (needsCategoryReset || needsSourceFilterNormalization) {
      updateViewSettingsMutation.mutate({
        activeCategoryId: null,
        sourceFilterSourceIds: normalizedSourceFilterIds,
      });
    }
  }, [
    normalizedSourceFilterIds,
    settingsQuery.data,
    updateViewSettingsMutation,
    updateViewSettingsMutation.isPending,
  ]);

  const filters = useMemo(
    () => ({
      activeCategory: "all" as const,
      sortKey: settingsQuery.data?.sortKey ?? "updatedAt",
      sortDirection: settingsQuery.data?.sortDirection ?? "desc",
      statusFilter: settingsQuery.data?.statusFilter ?? "all",
      sourceIds: normalizedSourceFilterIds,
    }),
    [
      normalizedSourceFilterIds,
      settingsQuery.data?.sortDirection,
      settingsQuery.data?.sortKey,
      settingsQuery.data?.statusFilter,
    ]
  );

  const entriesQuery = useQuery(libraryEntriesWithCategoriesQueryOptions(filters));

  const libraryEntries = useMemo(
    () =>
      (entriesQuery.data ?? []).filter((entry) =>
        allowedSourceIdSet.has(entry.sourceId)
      ),
    [allowedSourceIdSet, entriesQuery.data]
  );

  const GRID_COLUMNS = 2;
  const GRID_HORIZONTAL_PADDING = 16;
  const GRID_COLUMN_GAP = 12;

  const gridItemWidth = useMemo(() => {
    const totalGaps = GRID_COLUMN_GAP * (GRID_COLUMNS - 1);
    const totalPadding = GRID_HORIZONTAL_PADDING * 2;
    const availableWidth = screenWidth - totalGaps - totalPadding;
    return Math.max(1, Math.floor(availableWidth / GRID_COLUMNS));
  }, [screenWidth]);

  const selectedCount = selectedEntryIds.length;
  const isRefreshing = entriesQuery.isRefetching && !entriesQuery.isPending;

  useEffect(() => {
    if (isSelectMode && selectedCount === 0) {
      setIsSelectMode(false);
    }
  }, [isSelectMode, selectedCount]);

  const updateViewSettings = (input: {
    sortKey?: LibrarySortKey;
    sortDirection?: LibrarySortDirection;
    statusFilter?: LibraryStatusFilter;
    sourceFilterSourceIds?: string[];
  }) => {
    updateViewSettingsMutation.mutate(input);
  };

  const toggleSourceFilter = (sourceId: string) => {
    const current = normalizedSourceFilterIds;
    const isSelected = current.includes(sourceId);
    const next = isSelected
      ? current.filter((id) => id !== sourceId)
      : [...current, sourceId];

    const normalizedNext =
      next.length === 0 || next.length === allowedSourceIds.length ? [] : next;

    updateViewSettings({ sourceFilterSourceIds: normalizedNext });
  };

  const toggleEntrySelection = (entryId: number) => {
    setSelectedEntryIds((current) =>
      current.includes(entryId)
        ? current.filter((id) => id !== entryId)
        : [...current, entryId]
    );
  };

  const handleCardLongPress = (entryId: number) => {
    if (!isSelectMode) {
      setIsSelectMode(true);
      setSelectedEntryIds([entryId]);
      return;
    }

    toggleEntrySelection(entryId);
  };

  const handleBulkRemove = () => {
    if (selectedEntryIds.length === 0 || bulkRemoveMutation.isPending) {
      return;
    }

    Alert.alert(
      "Remove from Library",
      `Remove ${selectedEntryIds.length} selected manga from library?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            bulkRemoveMutation.mutate(selectedEntryIds, {
              onSuccess: () => {
                setSelectedEntryIds([]);
              },
            });
          },
        },
      ]
    );
  };

  if (settingsQuery.isPending) {
    return (
      <View className="flex-1 bg-[#111214]">
        <View className="px-4 pb-3 pt-2">
          <ScreenHeader
            title="Library"
            subtitle="Saved manga."
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
        <CenteredLoadingState
          withBackground={false}
          message="Loading library settings..."
        />
      </View>
    );
  }

  if (settingsQuery.isError) {
    return (
      <View className="flex-1 bg-[#111214]">
        <View className="px-4 pb-3 pt-2">
          <ScreenHeader
            title="Library"
            subtitle="Saved manga."
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
        <CenteredState
          withBackground={false}
          title="Could not load library settings"
          message={settingsQuery.error.message}
        >
          <View className="mt-4">
            <ActionPillButton
              label="Retry"
              onPress={() => {
                void settingsQuery.refetch();
              }}
            />
          </View>
        </CenteredState>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#111214]">
      <View className="px-4 pb-3 pt-2">
        <ScreenHeader
          title="Library"
          subtitle="Saved manga."
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

      {entriesQuery.isPending ? (
        <CenteredLoadingState withBackground={false} message="Loading library..." />
      ) : entriesQuery.isError ? (
        <CenteredState
          withBackground={false}
          title="Could not load library"
          message={entriesQuery.error.message}
        >
          <View className="mt-4">
            <ActionPillButton
              label="Retry"
              onPress={() => {
                void entriesQuery.refetch();
              }}
            />
          </View>
        </CenteredState>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={libraryEntries}
          numColumns={GRID_COLUMNS}
          keyExtractor={(item) => `${item.sourceId}::${item.mangaId}`}
          columnWrapperStyle={{ gap: GRID_COLUMN_GAP }}
          contentContainerClassName="px-4 pb-24"
          ItemSeparatorComponent={() => <View className="h-4" />}
          ListHeaderComponent={<View className="h-2" />}
          renderItem={({ item }) => {
            const isSelected = selectedEntryIds.includes(item.id);

            return (
              <LibraryEntryCard
                entry={item}
                width={gridItemWidth}
                isSelectMode={isSelectMode}
                isSelected={isSelected}
                onPress={() => {
                  if (isSelectMode) {
                    toggleEntrySelection(item.id);
                    return;
                  }

                  router.push({
                    pathname: "/manga/[sourceId]/[mangaId]",
                    params: { sourceId: item.sourceId, mangaId: item.mangaId },
                  });
                }}
                onLongPress={() => {
                  handleCardLongPress(item.id);
                }}
              />
            );
          }}
          ListEmptyComponent={
            <View className="items-center py-10">
              <Text className="text-sm text-[#9B9CA6]">
                No visible manga in your library.
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              tintColor="#67A4FF"
              refreshing={isRefreshing}
              onRefresh={() => {
                if (entriesQuery.isPending) {
                  return;
                }
                void entriesQuery.refetch();
              }}
            />
          }
        />
      )}

      <LibraryFilterSheet
        isOpen={isFilterSheetOpen}
        onOpenChange={setIsFilterSheetOpen}
        sortKey={filters.sortKey}
        sortDirection={filters.sortDirection}
        statusFilter={filters.statusFilter}
        sourceFilterIds={normalizedSourceFilterIds}
        sources={sources.map((source) => ({ id: source.id, name: source.name }))}
        onChangeSortKey={(next) => {
          updateViewSettings({ sortKey: next });
        }}
        onChangeSortDirection={(next) => {
          updateViewSettings({ sortDirection: next });
        }}
        onChangeStatus={(next) => {
          updateViewSettings({ statusFilter: next });
        }}
        onToggleSource={toggleSourceFilter}
        onResetSources={() => {
          updateViewSettings({ sourceFilterSourceIds: [] });
        }}
      />

      <LibraryBulkFab
        visible={isSelectMode}
        selectedCount={selectedCount}
        insets={insets}
        isPending={bulkRemoveMutation.isPending}
        onDeletePress={handleBulkRemove}
      />
    </View>
  );
}
