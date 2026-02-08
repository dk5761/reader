import { queryOptions } from "@tanstack/react-query";
import { libraryQueryFactory } from "./library.queryFactory";
import { getLibraryEntries, getLibraryEntry } from "./library.repository";

export const libraryEntriesQueryOptions = () =>
  queryOptions({
    queryKey: libraryQueryFactory.list(),
    queryFn: () => getLibraryEntries(),
  });

export const libraryEntryQueryOptions = (
  sourceId: string,
  mangaId: string,
  enabled: boolean
) =>
  queryOptions({
    queryKey: libraryQueryFactory.entry(sourceId, mangaId),
    queryFn: () => getLibraryEntry(sourceId, mangaId),
    enabled,
  });
