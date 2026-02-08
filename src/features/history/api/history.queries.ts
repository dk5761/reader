import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { GetGroupedReadingHistoryInput } from "@/services/history";
import {
  getGroupedReadingHistory,
  getLatestMangaHistoryEntry,
  getMangaHistoryEventsPage,
} from "@/services/history";
import { historyQueryFactory } from "./history.queryFactory";

export const groupedReadingHistoryQueryOptions = (
  input: GetGroupedReadingHistoryInput = {}
) =>
  queryOptions({
    queryKey: historyQueryFactory.grouped(input),
    queryFn: () => getGroupedReadingHistory(input),
  });

export const latestMangaHistoryEntryQueryOptions = (
  sourceId: string,
  mangaId: string,
  enabled: boolean
) =>
  queryOptions({
    queryKey: historyQueryFactory.mangaLatest(sourceId, mangaId),
    queryFn: () => getLatestMangaHistoryEntry(sourceId, mangaId),
    enabled,
  });

export const mangaHistoryEventsInfiniteQueryOptions = (
  sourceId: string,
  mangaId: string,
  enabled: boolean,
  pageSize = 50
) =>
  infiniteQueryOptions({
    queryKey: historyQueryFactory.mangaTimelinePage(sourceId, mangaId, pageSize),
    queryFn: ({ pageParam }) =>
      getMangaHistoryEventsPage(sourceId, mangaId, {
        cursor: pageParam ?? undefined,
        limit: pageSize,
      }),
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
  });
