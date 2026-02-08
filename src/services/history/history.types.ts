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

export interface ReadingHistoryChapterItem {
  sourceId: string;
  mangaId: string;
  chapterId: string;
  chapterTitle?: string;
  chapterNumber?: number;
  pageIndex: number;
  totalPages?: number;
  updatedAt: number;
}

export interface ReadingHistoryMangaGroup {
  sourceId: string;
  mangaId: string;
  mangaTitle: string;
  mangaThumbnailUrl?: string;
  latestReadAt: number;
  chapters: ReadingHistoryChapterItem[];
}

export interface GetGroupedReadingHistoryInput {
  entryLimit?: number;
  perMangaChapterLimit?: number;
}
