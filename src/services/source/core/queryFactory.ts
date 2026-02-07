import type { SourceListParams, SourceSearchParams } from "./types";

const serializeOptions = (options?: object) => {
  if (!options || typeof options !== "object") {
    return {};
  }

  const entries = Object.entries(options).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
};

export const sourceQueryFactory = {
  all: () => ["sources"] as const,

  byId: (sourceId: string) => [...sourceQueryFactory.all(), sourceId] as const,

  search: (sourceId: string, params: SourceSearchParams) =>
    [...sourceQueryFactory.byId(sourceId), "search", serializeOptions(params)] as const,

  manga: (sourceId: string, mangaId: string) =>
    [...sourceQueryFactory.byId(sourceId), "manga", mangaId] as const,

  chapters: (sourceId: string, mangaId: string) =>
    [...sourceQueryFactory.byId(sourceId), "chapters", mangaId] as const,

  chapterPages: (sourceId: string, chapterId: string) =>
    [...sourceQueryFactory.byId(sourceId), "chapter", chapterId, "pages"] as const,

  latest: (sourceId: string, params?: SourceListParams) =>
    [...sourceQueryFactory.byId(sourceId), "latest", serializeOptions(params)] as const,

  popular: (sourceId: string, params?: SourceListParams) =>
    [...sourceQueryFactory.byId(sourceId), "popular", serializeOptions(params)] as const,
};
