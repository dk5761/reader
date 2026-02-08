export interface ReadingHistoryEntry {
  id: number;
  sourceId: string;
  mangaId: string;
  chapterId: string;
  mangaTitle: string;
  mangaThumbnailUrl?: string;
  chapterTitle?: string;
  chapterNumber?: number;
  pageIndex: number;
  totalPages?: number;
  updatedAt: number;
}

export interface UpsertReadingHistoryInput {
  sourceId: string;
  mangaId: string;
  chapterId: string;
  mangaTitle: string;
  mangaThumbnailUrl?: string;
  chapterTitle?: string;
  chapterNumber?: number;
  pageIndex: number;
  totalPages?: number;
}
