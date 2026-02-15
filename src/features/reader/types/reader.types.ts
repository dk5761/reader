import type {
  SourceChapter,
  SourceMangaDetails,
  SourcePage,
} from "@/services/source";

export type ReaderMode = "vertical";

export interface ReaderSessionParams {
  sourceId: string;
  mangaId: string;
  chapterId: string;
  initialPageParam?: string;
}

export interface ReaderSessionMeta {
  sourceId: string;
  mangaId: string;
  mangaTitle: string;
  mangaThumbnailUrl?: string;
}

export interface ReaderLoadedChapter {
  chapter: SourceChapter;
  pages: SourcePage[];
}

export interface ReaderFlatPage {
  key: string;
  flatIndex: number;
  chapterId: string;
  chapterTitle: string;
  chapterNumber?: number;
  chapterIndex: number;
  pageIndex: number;
  totalPagesInChapter: number;
  imageUrl: string;
  headers?: Record<string, string>;
}

export interface ReaderSessionResolvedData {
  meta: ReaderSessionMeta;
  manga: SourceMangaDetails;
  chapters: SourceChapter[];
  initialChapter: SourceChapter;
  initialPages: SourcePage[];
  initialPage: number;
}

export interface ReaderCurrentProgressPayload {
  sourceId: string;
  mangaId: string;
  chapterId: string;
  chapterTitle?: string;
  chapterNumber?: number;
  mangaTitle: string;
  mangaThumbnailUrl?: string;
  pageIndex: number;
  totalPages?: number;
}

export interface ReaderPageMetrics {
  currentPage: number;
  totalPages: number;
  chapterId: string | null;
}

// Placeholder for showing previous chapter loading prompt
export interface ReaderChapterPlaceholder {
  type: "previous-chapter-prompt";
  chapterId: string;
  chapterTitle: string;
  chapterNumber?: number;
}
