export type SourceId = string;

export interface SourceDescriptor {
  id: SourceId;
  name: string;
  language: string;
  baseUrl: string;
  iconUrl?: string;
  isNsfw?: boolean;
  supportsSearch?: boolean;
  supportsPopular?: boolean;
  supportsLatest?: boolean;
  supportsFilters?: boolean;
}

export interface SourceManga {
  id: string;
  title: string;
  url: string;
  thumbnailUrl?: string;
}

export interface SourceMangaDetails extends SourceManga {
  description?: string;
  alternativeTitles?: string[];
  authors?: string[];
  artists?: string[];
  genres?: string[];
  status?: "ongoing" | "completed" | "hiatus" | "cancelled" | "unknown";
}

export interface SourceChapter {
  id: string;
  title: string;
  url: string;
  number?: number;
  uploadedAt?: string;
  scanlator?: string;
}

export interface SourcePage {
  index: number;
  imageUrl: string;
  headers?: Record<string, string>;
  // Optional dimensions for aspect ratio calculation
  width?: number;
  height?: number;
  // Optional chapter info extracted from the page
  chapterTitle?: string;
  chapterNumber?: number;
}

export interface SourcePagedResult<T> {
  items: T[];
  page: number;
  hasNextPage: boolean;
}

export interface SourceListParams {
  page?: number;
  limit?: number;
}

export interface SourceSearchParams extends SourceListParams {
  query: string;
  filters?: Record<string, unknown>;
}

export interface SourceRequestOptions {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  data?: unknown;
  responseType?: "json" | "text" | "arraybuffer";
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface SourceResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
  finalUrl: string;
}

export interface SourceRequestClient {
  request: <T>(options: SourceRequestOptions) => Promise<SourceResponse<T>>;
  get: <T>(
    url: string,
    options?: Omit<SourceRequestOptions, "url" | "method">
  ) => Promise<SourceResponse<T>>;
  post: <T>(
    url: string,
    data?: unknown,
    options?: Omit<SourceRequestOptions, "url" | "method" | "data">
  ) => Promise<SourceResponse<T>>;
}

export interface SourceAdapterContext {
  http: SourceRequestClient;
}

export interface SourceAdapter {
  descriptor: SourceDescriptor;
  search: (
    params: SourceSearchParams,
    context: SourceAdapterContext
  ) => Promise<SourcePagedResult<SourceManga>>;
  getMangaDetails: (
    mangaId: string,
    context: SourceAdapterContext
  ) => Promise<SourceMangaDetails>;
  getChapters: (
    mangaId: string,
    context: SourceAdapterContext
  ) => Promise<SourceChapter[]>;
  getChapterPages: (
    chapterId: string,
    context: SourceAdapterContext
  ) => Promise<SourcePage[]>;
  getLatestUpdates?: (
    params: SourceListParams,
    context: SourceAdapterContext
  ) => Promise<SourcePagedResult<SourceManga>>;
  getPopularTitles?: (
    params: SourceListParams,
    context: SourceAdapterContext
  ) => Promise<SourcePagedResult<SourceManga>>;
}
