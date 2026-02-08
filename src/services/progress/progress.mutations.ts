import { useMutation, useQueryClient } from "@tanstack/react-query";
import { progressQueryFactory } from "./progress.queryFactory";
import {
  clearChapterReadingProgress,
  clearChapterReadingProgressMany,
  upsertReadingProgress,
  upsertReadingProgressMany,
} from "./progress.repository";
import type { ReadingProgressEntry, UpsertReadingProgressInput } from "./progress.types";

const waitForNextFrame = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
};

const invalidateProgressQueries = async (
  queryClient: ReturnType<typeof useQueryClient>,
  sourceId: string,
  mangaId: string,
  chapterIds: string[]
) => {
  const byChapterInvalidations = chapterIds.map((chapterId) =>
    queryClient.invalidateQueries({
      queryKey: progressQueryFactory.byChapter(sourceId, mangaId, chapterId),
    })
  );

  await Promise.all([
    ...byChapterInvalidations,
    queryClient.invalidateQueries({
      queryKey: progressQueryFactory.byManga(sourceId, mangaId),
    }),
    queryClient.invalidateQueries({
      queryKey: progressQueryFactory.latestByManga(sourceId, mangaId),
    }),
    queryClient.invalidateQueries({
      queryKey: progressQueryFactory.all(),
    }),
  ]);
};

interface OptimisticChapterInput {
  chapterId: string;
  chapterTitle?: string;
  chapterNumber?: number;
}

interface OptimisticUpdateInput {
  sourceId: string;
  mangaId: string;
  markAsRead: boolean;
  chapters: OptimisticChapterInput[];
}

const applyOptimisticReadState = (
  currentEntries: ReadingProgressEntry[] | undefined,
  input: OptimisticUpdateInput
): ReadingProgressEntry[] => {
  const now = Date.now();
  const entries = currentEntries ?? [];
  const chapters = input.chapters.filter((chapter, index, array) => {
    return array.findIndex((candidate) => candidate.chapterId === chapter.chapterId) === index;
  });

  if (chapters.length === 0) {
    return entries;
  }

  if (!input.markAsRead) {
    const chapterIdSet = new Set(chapters.map((chapter) => chapter.chapterId));
    return entries.filter((entry) => !chapterIdSet.has(entry.chapterId));
  }

  const entryByChapterId = new Map(entries.map((entry) => [entry.chapterId, entry]));
  chapters.forEach((chapter, index) => {
    const previous = entryByChapterId.get(chapter.chapterId);
    entryByChapterId.set(chapter.chapterId, {
      id: previous?.id ?? -(now + index + 1),
      sourceId: input.sourceId,
      mangaId: input.mangaId,
      chapterId: chapter.chapterId,
      chapterTitle: chapter.chapterTitle ?? previous?.chapterTitle,
      chapterNumber: chapter.chapterNumber ?? previous?.chapterNumber,
      pageIndex: previous?.pageIndex ?? 0,
      totalPages: previous?.totalPages,
      isCompleted: true,
      updatedAt: now,
    });
  });

  return [...entryByChapterId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
};

interface SetChapterReadStateInput {
  sourceId: string;
  mangaId: string;
  chapterId: string;
  chapterTitle?: string;
  chapterNumber?: number;
  markAsRead: boolean;
}

interface SetBelowChaptersReadStateInput {
  sourceId: string;
  mangaId: string;
  chapters: OptimisticChapterInput[];
  markAsRead: boolean;
}

export const useUpsertReadingProgressMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpsertReadingProgressInput) => {
      upsertReadingProgress(input);
    },
    onSuccess: async (_result, input) => {
      await invalidateProgressQueries(queryClient, input.sourceId, input.mangaId, [
        input.chapterId,
      ]);
    },
  });
};

interface ClearChapterReadingProgressInput {
  sourceId: string;
  mangaId: string;
  chapterId: string;
}

export const useClearChapterReadingProgressMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ClearChapterReadingProgressInput) => {
      clearChapterReadingProgress(input.sourceId, input.mangaId, input.chapterId);
    },
    onSuccess: async (_result, input) => {
      await invalidateProgressQueries(queryClient, input.sourceId, input.mangaId, [
        input.chapterId,
      ]);
    },
  });
};

export const useSetChapterReadStateMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SetChapterReadStateInput) => {
      await waitForNextFrame();

      if (input.markAsRead) {
        upsertReadingProgress({
          sourceId: input.sourceId,
          mangaId: input.mangaId,
          chapterId: input.chapterId,
          chapterTitle: input.chapterTitle,
          chapterNumber: input.chapterNumber,
          pageIndex: 0,
          totalPages: undefined,
          isCompleted: true,
        });
        return;
      }

      clearChapterReadingProgress(input.sourceId, input.mangaId, input.chapterId);
    },
    onMutate: async (input) => {
      const queryKey = progressQueryFactory.byManga(input.sourceId, input.mangaId);
      await queryClient.cancelQueries({ queryKey });

      const previousEntries = queryClient.getQueryData<ReadingProgressEntry[]>(queryKey);
      queryClient.setQueryData<ReadingProgressEntry[]>(queryKey, (currentEntries) =>
        applyOptimisticReadState(currentEntries, {
          sourceId: input.sourceId,
          mangaId: input.mangaId,
          markAsRead: input.markAsRead,
          chapters: [
            {
              chapterId: input.chapterId,
              chapterTitle: input.chapterTitle,
              chapterNumber: input.chapterNumber,
            },
          ],
        })
      );

      return { previousEntries, queryKey };
    },
    onError: (_error, _input, context) => {
      if (!context) {
        return;
      }
      queryClient.setQueryData(context.queryKey, context.previousEntries);
    },
    onSettled: async (_result, _error, input) => {
      await invalidateProgressQueries(queryClient, input.sourceId, input.mangaId, [
        input.chapterId,
      ]);
    },
  });
};

export const useSetBelowChaptersReadStateMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SetBelowChaptersReadStateInput) => {
      await waitForNextFrame();

      if (input.chapters.length === 0) {
        return;
      }

      if (input.markAsRead) {
        upsertReadingProgressMany(
          input.chapters.map((chapter) => ({
            sourceId: input.sourceId,
            mangaId: input.mangaId,
            chapterId: chapter.chapterId,
            chapterTitle: chapter.chapterTitle,
            chapterNumber: chapter.chapterNumber,
            pageIndex: 0,
            totalPages: undefined,
            isCompleted: true,
          }))
        );
        return;
      }

      clearChapterReadingProgressMany({
        sourceId: input.sourceId,
        mangaId: input.mangaId,
        chapterIds: input.chapters.map((chapter) => chapter.chapterId),
      });
    },
    onMutate: async (input) => {
      const queryKey = progressQueryFactory.byManga(input.sourceId, input.mangaId);
      await queryClient.cancelQueries({ queryKey });

      const previousEntries = queryClient.getQueryData<ReadingProgressEntry[]>(queryKey);
      queryClient.setQueryData<ReadingProgressEntry[]>(queryKey, (currentEntries) =>
        applyOptimisticReadState(currentEntries, {
          sourceId: input.sourceId,
          mangaId: input.mangaId,
          markAsRead: input.markAsRead,
          chapters: input.chapters,
        })
      );

      return { previousEntries, queryKey };
    },
    onError: (_error, _input, context) => {
      if (!context) {
        return;
      }
      queryClient.setQueryData(context.queryKey, context.previousEntries);
    },
    onSettled: async (_result, _error, input) => {
      await invalidateProgressQueries(
        queryClient,
        input.sourceId,
        input.mangaId,
        input.chapters.map((chapter) => chapter.chapterId)
      );
    },
  });
};
