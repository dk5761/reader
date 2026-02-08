import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import {
  getSourceChapterPages,
  getSourceChapters,
  getSourceMangaDetails,
  type SourcePage,
} from "@/services/source";
import { readerQueryFactory } from "./reader.queryFactory";

export const readerMangaDetailsQueryOptions = (
  sourceId: string,
  mangaId: string,
  enabled: boolean
) =>
  queryOptions({
    queryKey: [...readerQueryFactory.all(), "manga", sourceId, mangaId] as const,
    queryFn: ({ signal }) => getSourceMangaDetails(sourceId, mangaId, signal),
    enabled,
  });

export const readerChaptersQueryOptions = (
  sourceId: string,
  mangaId: string,
  enabled: boolean
) =>
  queryOptions({
    queryKey: [...readerQueryFactory.all(), "chapters", sourceId, mangaId] as const,
    queryFn: ({ signal }) => getSourceChapters(sourceId, mangaId, signal),
    enabled,
  });

export const readerChapterPagesQueryOptions = (
  sourceId: string,
  chapterId: string,
  enabled: boolean
) =>
  queryOptions({
    queryKey: readerQueryFactory.chapterPages(sourceId, chapterId),
    queryFn: ({ signal }) => getSourceChapterPages(sourceId, chapterId, signal),
    enabled,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });

export const prefetchReaderChapterPages = async (
  queryClient: QueryClient,
  sourceId: string,
  chapterId: string
): Promise<SourcePage[]> =>
  queryClient.fetchQuery(
    readerChapterPagesQueryOptions(sourceId, chapterId, Boolean(sourceId && chapterId))
  );
