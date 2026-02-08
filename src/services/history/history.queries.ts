import { queryOptions } from "@tanstack/react-query";
import { historyQueryFactory } from "./history.queryFactory";
import {
  getLatestMangaHistoryEntry,
  getReadingHistoryEntries,
} from "./history.repository";

export const readingHistoryEntriesQueryOptions = (limit = 50) =>
  queryOptions({
    queryKey: historyQueryFactory.latest(limit),
    queryFn: () => getReadingHistoryEntries(limit),
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
