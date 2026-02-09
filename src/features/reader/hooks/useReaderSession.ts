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

const dedupeChapters = (chapters: SourceChapter[]): SourceChapter[] => {
  const seen = new Set<string>();
  return chapters.filter((chapter) => {
    const key = `${chapter.id}::${chapter.url}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const normalizeIdentity = (value: string | undefined | null): string => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }

  return raw.replace(/\/+$/, "");
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

    return (
      chapters.find((entry) => {
        const chapterId = normalizeIdentity(entry.id);
        const chapterUrl = normalizeIdentity(entry.url);
        return chapterId === target || chapterUrl === target;
      }) ?? null
    );
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
