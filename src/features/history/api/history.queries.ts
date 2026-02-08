import { queryOptions } from "@tanstack/react-query";
import type { GetGroupedReadingHistoryInput } from "@/services/history";
import { getGroupedReadingHistory, getLatestMangaHistoryEntry } from "@/services/history";
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

