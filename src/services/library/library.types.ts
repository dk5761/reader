import type { SourceMangaDetails } from "@/services/source";

export interface LibraryEntry {
  id: number;
  sourceId: string;
  mangaId: string;
  mangaUrl: string;
  title: string;
  thumbnailUrl?: string;
  description?: string;
  status?: SourceMangaDetails["status"];
  addedAt: number;
  updatedAt: number;
  lastReadAt?: number;
}

export interface UpsertLibraryEntryInput {
  sourceId: string;
  mangaId: string;
  mangaUrl?: string;
  title: string;
  thumbnailUrl?: string;
  description?: string;
  status?: SourceMangaDetails["status"];
}

export interface LibraryCategory {
  id: number;
  name: string;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateLibraryCategoryInput {
  name: string;
}

export interface UpdateLibraryCategoryInput {
  id: number;
  name: string;
}

export type LibrarySortKey = "title" | "updatedAt" | "addedAt" | "lastReadAt";

export type LibrarySortDirection = "asc" | "desc";

export type LibraryStatusFilter = "all" | "ongoing" | "completed" | "hiatus" | "unknown";

export type LibraryActiveCategoryFilter = "all" | "uncategorized" | number;

export interface LibraryViewSettings {
  activeCategoryId: number | null;
  sortKey: LibrarySortKey;
  sortDirection: LibrarySortDirection;
  statusFilter: LibraryStatusFilter;
  sourceFilterSourceIds: string[];
  updatedAt: number;
}

export interface UpdateLibraryViewSettingsInput {
  activeCategoryId?: number | null;
  sortKey?: LibrarySortKey;
  sortDirection?: LibrarySortDirection;
  statusFilter?: LibraryStatusFilter;
  sourceFilterSourceIds?: string[];
}

export interface LibraryFilterInput {
  activeCategory?: LibraryActiveCategoryFilter;
  sortKey?: LibrarySortKey;
  sortDirection?: LibrarySortDirection;
  statusFilter?: LibraryStatusFilter;
  sourceIds?: string[];
}

export interface LibraryEntryWithCategories extends LibraryEntry {
  categoryIds: number[];
}

export interface BulkLibraryActionInput {
  libraryEntryIds: number[];
}
