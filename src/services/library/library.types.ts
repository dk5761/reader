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
