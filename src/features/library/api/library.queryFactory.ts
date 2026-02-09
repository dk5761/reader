import type { LibraryFilterInput } from "@/services/library";

const buildFilterSignature = (filters: LibraryFilterInput): string =>
  JSON.stringify({
    activeCategory: filters.activeCategory ?? "all",
    sortKey: filters.sortKey ?? "updatedAt",
    sortDirection: filters.sortDirection ?? "desc",
    statusFilter: filters.statusFilter ?? "all",
    sourceIds: (filters.sourceIds ?? []).slice().sort(),
  });

export const libraryFeatureQueryFactory = {
  all: () => ["library", "feature"] as const,

  categories: () => [...libraryFeatureQueryFactory.all(), "categories"] as const,

  viewSettings: () => [...libraryFeatureQueryFactory.all(), "view-settings"] as const,

  entries: (filters: LibraryFilterInput) =>
    [...libraryFeatureQueryFactory.all(), "entries", buildFilterSignature(filters)] as const,

  entryCategories: (libraryEntryId: number) =>
    [...libraryFeatureQueryFactory.all(), "entry-categories", libraryEntryId] as const,
};
