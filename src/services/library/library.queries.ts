import { queryOptions } from "@tanstack/react-query";
import { libraryQueryFactory } from "./library.queryFactory";
import {
  getLibraryCategories,
  getLibraryEntries,
  getLibraryEntriesWithCategories,
  getLibraryEntry,
  getLibraryViewSettings,
} from "./library.repository";
import type { LibraryFilterInput } from "./library.types";

const buildFilterSignature = (filters: LibraryFilterInput): string =>
  JSON.stringify({
    activeCategory: filters.activeCategory ?? "all",
    sortKey: filters.sortKey ?? "updatedAt",
    sortDirection: filters.sortDirection ?? "desc",
    statusFilter: filters.statusFilter ?? "all",
    sourceIds: (filters.sourceIds ?? []).slice().sort(),
  });

export const libraryEntriesQueryOptions = () =>
  queryOptions({
    queryKey: libraryQueryFactory.list(),
    queryFn: () => getLibraryEntries(),
  });

export const libraryEntriesWithCategoriesQueryOptions = (
  filters: LibraryFilterInput
) =>
  queryOptions({
    queryKey: libraryQueryFactory.listWithCategories(buildFilterSignature(filters)),
    queryFn: () => getLibraryEntriesWithCategories(filters),
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

export const libraryCategoriesQueryOptions = () =>
  queryOptions({
    queryKey: libraryQueryFactory.categories(),
    queryFn: () => getLibraryCategories(),
  });

export const libraryViewSettingsQueryOptions = () =>
  queryOptions({
    queryKey: libraryQueryFactory.viewSettings(),
    queryFn: () => getLibraryViewSettings(),
  });
