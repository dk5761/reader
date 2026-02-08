import { queryOptions } from "@tanstack/react-query";
import { progressQueryFactory } from "./progress.queryFactory";
import {
  getChapterProgress,
  getMangaReadingProgress,
  getLatestMangaProgress,
  getLatestReadingProgress,
} from "./progress.repository";

export const latestReadingProgressQueryOptions = (limit = 50) =>
  queryOptions({
    queryKey: progressQueryFactory.latest(limit),
    queryFn: () => getLatestReadingProgress(limit),
  });

export const chapterProgressQueryOptions = (
  sourceId: string,
  mangaId: string,
  chapterId: string,
  enabled: boolean
) =>
  queryOptions({
    queryKey: progressQueryFactory.byChapter(sourceId, mangaId, chapterId),
    queryFn: () => getChapterProgress(sourceId, mangaId, chapterId),
    enabled,
  });

export const mangaReadingProgressQueryOptions = (
  sourceId: string,
  mangaId: string,
  enabled: boolean
) =>
  queryOptions({
    queryKey: progressQueryFactory.byManga(sourceId, mangaId),
    queryFn: () => getMangaReadingProgress(sourceId, mangaId),
    enabled,
  });

export const latestMangaProgressQueryOptions = (
  sourceId: string,
  mangaId: string,
  enabled: boolean
) =>
  queryOptions({
    queryKey: progressQueryFactory.latestByManga(sourceId, mangaId),
    queryFn: () => getLatestMangaProgress(sourceId, mangaId),
    enabled,
  });
