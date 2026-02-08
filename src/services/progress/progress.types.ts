export interface ReadingProgressEntry {
  id: number;
  sourceId: string;
  mangaId: string;
  chapterId: string;
  chapterTitle?: string;
  chapterNumber?: number;
  pageIndex: number;
  totalPages?: number;
  isCompleted: boolean;
  updatedAt: number;
}

export interface UpsertReadingProgressInput {
  sourceId: string;
  mangaId: string;
  chapterId: string;
  chapterTitle?: string;
  chapterNumber?: number;
  pageIndex: number;
  totalPages?: number;
  isCompleted?: boolean;
}
