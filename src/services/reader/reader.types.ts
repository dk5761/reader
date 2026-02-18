export interface ReaderPage {
  index: number;
  pageId: string;
  imageUrl: string;
  headers?: Record<string, string>;
  // Pre-fetched dimensions for aspect ratio calculation
  width?: number;
  height?: number;
  state: PageState;
}

export type PageState =
  | { status: "queue" }
  | { status: "loading" }
  | { status: "ready"; imageUrl: string }
  | { status: "error"; error: string };

export interface ReaderChapter {
  id: string;
  sourceId: string;
  mangaId: string;
  title?: string;
  number?: number;
  pages: ReaderPage[];
  state: ChapterState;
}

export type ChapterState =
  | { status: "loading" }
  | { status: "loaded" }
  | { status: "error"; error: string };
