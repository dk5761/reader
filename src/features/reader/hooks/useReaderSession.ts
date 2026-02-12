import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { chapterProgressQueryOptions } from "@/services/progress";
import type { SourceChapter } from "@/services/source";
import {
  readerChapterPagesQueryOptions,
  readerChaptersQueryOptions,
  readerMangaDetailsQueryOptions,
} from "../api/reader.queries";
import type {
  ReaderSessionParams,
  ReaderSessionResolvedData,
} from "../types/reader.types";

const normalizeIdentity = (value: string | undefined | null): string => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }

  return raw.replace(/\/+$/, "");
};

const dedupeChapters = (chapters: SourceChapter[]): SourceChapter[] => {
  const seen = new Map<string, SourceChapter>();

  chapters.forEach((chapter) => {
    // Use normalized id + url as key
    const normalizedId = normalizeIdentity(chapter.id);
    const normalizedUrl = normalizeIdentity(chapter.url);
    const key = `${normalizedId}::${normalizedUrl}`;

    // Only add if we haven't seen this exact combination
    if (!seen.has(key)) {
      seen.set(key, chapter);
    }
  });

  return Array.from(seen.values());
};

const resolveInitialPage = (
  initialPageParam: string | undefined,
  persistedPage: number | undefined
): number => {
  if (initialPageParam !== undefined) {
    const parsed = Number.parseInt(initialPageParam, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  if (persistedPage !== undefined && Number.isFinite(persistedPage) && persistedPage >= 0) {
    return persistedPage;
  }

  return 0;
};

export const useReaderSession = (params: ReaderSessionParams) => {
  const canQuery = Boolean(params.sourceId && params.mangaId && params.chapterId);

  const mangaQuery = useQuery(
    readerMangaDetailsQueryOptions(params.sourceId, params.mangaId, canQuery)
  );
  const chaptersQuery = useQuery(
    readerChaptersQueryOptions(params.sourceId, params.mangaId, canQuery)
  );

  const chapters = useMemo(
    () => dedupeChapters(chaptersQuery.data ?? []),
    [chaptersQuery.data]
  );

  const resolvedInitialChapter = useMemo(() => {
    if (!params.chapterId) {
      return chapters[0] ?? null;
    }

    const target = normalizeIdentity(params.chapterId);
    if (!target) {
      return chapters[0] ?? null;
    }

    // First try exact match on id or url
    const exactMatch = chapters.find((entry) => {
      const chapterId = normalizeIdentity(entry.id);
      const chapterUrl = normalizeIdentity(entry.url);
      return chapterId === target || chapterUrl === target;
    });

    if (exactMatch) {
      return exactMatch;
    }

    // If no exact match, try to find by chapter number
    const targetNum = Number.parseFloat(target);
    if (Number.isFinite(targetNum)) {
      const byNumber = chapters.find((entry) => {
        return entry.number === targetNum;
      });
      if (byNumber) {
        return byNumber;
      }
    }

    // Last resort: return first chapter (shouldn't happen if source is correct)
    return chapters[0] ?? null;
  }, [chapters, params.chapterId]);

  const initialChapterId = resolvedInitialChapter?.id ?? params.chapterId;

  const chapterPagesQuery = useQuery(
    readerChapterPagesQueryOptions(
      params.sourceId,
      initialChapterId,
      Boolean(canQuery && initialChapterId)
    )
  );
  const chapterProgressQuery = useQuery(
    chapterProgressQueryOptions(
      params.sourceId,
      params.mangaId,
      initialChapterId,
      Boolean(canQuery && initialChapterId)
    )
  );

  const resolvedData = useMemo<ReaderSessionResolvedData | null>(() => {
    if (
      !mangaQuery.data ||
      !chapterPagesQuery.data ||
      chaptersQuery.isPending
    ) {
      return null;
    }

    const initialChapter =
      resolvedInitialChapter ??
      (params.chapterId
        ? ({
            id: params.chapterId,
            title: `Chapter ${params.chapterId}`,
            url: params.chapterId,
          } as SourceChapter)
        : chapters[0] ?? null);

    if (!initialChapter) {
      return null;
    }

    return {
      meta: {
        sourceId: params.sourceId,
        mangaId: params.mangaId,
        mangaTitle: mangaQuery.data.title,
        mangaThumbnailUrl: mangaQuery.data.thumbnailUrl,
      },
      manga: mangaQuery.data,
      chapters,
      initialChapter,
      initialPages: chapterPagesQuery.data,
      initialPage: resolveInitialPage(
        params.initialPageParam,
        chapterProgressQuery.data?.pageIndex
      ),
    };
  }, [
    chapterPagesQuery.data,
    chapterProgressQuery.data?.pageIndex,
    chapters,
    chaptersQuery.isPending,
    mangaQuery.data,
    params.chapterId,
    params.initialPageParam,
    params.mangaId,
    params.sourceId,
    resolvedInitialChapter,
  ]);

  return {
    mangaQuery,
    chaptersQuery,
    chapterPagesQuery,
    chapterProgressQuery,
    resolvedData,
    isPending:
      mangaQuery.isPending || chaptersQuery.isPending || chapterPagesQuery.isPending,
    error:
      mangaQuery.error ?? chaptersQuery.error ?? chapterPagesQuery.error ?? null,
  };
};
