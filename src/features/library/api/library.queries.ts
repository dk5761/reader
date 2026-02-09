import { queryOptions } from "@tanstack/react-query";
import {
  getEntryCategoryIds,
  getLibraryCategories,
  getLibraryEntriesWithCategories,
  getLibraryViewSettings,
  type LibraryFilterInput,
} from "@/services/library";
import { libraryFeatureQueryFactory } from "./library.queryFactory";

export const libraryCategoriesQueryOptions = () =>
  queryOptions({
    queryKey: libraryFeatureQueryFactory.categories(),
    queryFn: () => getLibraryCategories(),
  });

export const libraryViewSettingsQueryOptions = () =>
  queryOptions({
    queryKey: libraryFeatureQueryFactory.viewSettings(),
    queryFn: () => getLibraryViewSettings(),
  });

export const libraryEntriesWithCategoriesQueryOptions = (
  filters: LibraryFilterInput
) =>
  queryOptions({
    queryKey: libraryFeatureQueryFactory.entries(filters),
    queryFn: () => getLibraryEntriesWithCategories(filters),
  });

export const libraryEntryCategoriesQueryOptions = (
  libraryEntryId: number,
  enabled: boolean
) =>
  queryOptions({
    queryKey: libraryFeatureQueryFactory.entryCategories(libraryEntryId),
    queryFn: () => getEntryCategoryIds(libraryEntryId),
    enabled,
  });
