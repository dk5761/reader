import { useMemo, useState, useCallback } from "react";
import type { SourceChapter } from "@/services/source";
import type { MangaProgress } from "@/services/progress";

interface PendingBelowRule {
  anchorIndex: number;
  targetReadState: boolean;
  opId: number;
}

interface UseChapterProgressOptions {
  chapters: SourceChapter[];
  progress: MangaProgress[] | undefined;
  setChapterReadState: (input: {
    sourceId: string;
    mangaId: string;
    chapterId: string;
    chapterTitle: string;
    chapterNumber: number | undefined;
    markAsRead: boolean;
  }) => void;
  setBelowChaptersReadState: (input: {
    sourceId: string;
    mangaId: string;
    chapters: Array<{
      chapterId: string;
      chapterTitle: string;
      chapterNumber: number | undefined;
    }>;
    markAsRead: boolean;
  }, options?: {
    onError?: () => void;
    onSettled?: () => void;
  }) => void;
  sourceId: string;
  mangaId: string;
}

interface UseChapterProgressReturn {
  progressByChapterId: Map<string, MangaProgress>;
  effectiveReadByChapterId: Map<string, boolean>;
  areAllBelowReadByIndex: boolean[];
  isMutationPending: boolean;
  pendingBelowRule: PendingBelowRule | null;
  isChapterRead: (chapterId: string) => boolean;
  getBelowChapterInputs: (chapterIndex: number) => Array<{
    chapterId: string;
    chapterTitle: string;
    chapterNumber: number | undefined;
  }>;
  toggleChapterRead: (chapter: SourceChapter, currentReadState: boolean) => void;
  toggleBelowChaptersRead: (chapterIndex: number, shouldMarkBelowAsRead: boolean) => void;
  clearPendingBelowRule: () => void;
}

export function useChapterProgress({
  chapters,
  progress,
  setChapterReadState,
  setBelowChaptersReadState,
  sourceId,
  mangaId,
}: UseChapterProgressOptions): UseChapterProgressReturn {
  const [pendingBelowRule, setPendingBelowRule] = useState<PendingBelowRule | null>(null);

  const progressByChapterId = useMemo(
    () =>
      new Map(
        (progress ?? []).map((entry) => [entry.chapterId, entry])
      ),
    [progress]
  );

  const effectiveReadByChapterId = useMemo(() => {
    const map = new Map<string, boolean>();
    chapters.forEach((chapter, index) => {
      const baseReadState = Boolean(
        progressByChapterId.get(chapter.id)?.isCompleted
      );
      if (!pendingBelowRule) {
        map.set(chapter.id, baseReadState);
        return;
      }

      const isBelowPendingAnchor = index > pendingBelowRule.anchorIndex;
      map.set(
        chapter.id,
        isBelowPendingAnchor ? pendingBelowRule.targetReadState : baseReadState
      );
    });
    return map;
  }, [chapters, pendingBelowRule, progressByChapterId]);

  const areAllBelowReadByIndex = useMemo(() => {
    if (chapters.length === 0) {
      return [] as boolean[];
    }

    const result = new Array<boolean>(chapters.length).fill(true);
    for (let index = chapters.length - 2; index >= 0; index -= 1) {
      const nextChapterId = chapters[index + 1]?.id;
      const nextIsRead = nextChapterId
        ? Boolean(effectiveReadByChapterId.get(nextChapterId))
        : true;
      result[index] = result[index + 1] && nextIsRead;
    }
    return result;
  }, [chapters, effectiveReadByChapterId]);

  const isMutationPending = false; // This would come from mutations in the parent

  const isChapterRead = useCallback(
    (chapterId: string) => Boolean(effectiveReadByChapterId.get(chapterId)),
    [effectiveReadByChapterId]
  );

  const getBelowChapterInputs = useCallback(
    (chapterIndex: number) => {
      const hasBelowChapters = chapterIndex < chapters.length - 1;
      if (!hasBelowChapters) return [];

      return chapters
        .slice(chapterIndex + 1)
        .filter((chapter, chapterIndex2, chapterArray) => {
          return (
            chapterArray.findIndex((candidate) => candidate.id === chapter.id) ===
            chapterIndex2
          );
        })
        .map((chapter) => ({
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          chapterNumber: chapter.number,
        }));
    },
    [chapters]
  );

  const toggleChapterRead = useCallback(
    (chapter: SourceChapter, currentReadState: boolean) => {
      setChapterReadState({
        sourceId,
        mangaId,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        chapterNumber: chapter.number,
        markAsRead: !currentReadState,
      });
    },
    [mangaId, setChapterReadState, sourceId]
  );

  const toggleBelowChaptersRead = useCallback(
    (chapterIndex: number, shouldMarkBelowAsRead: boolean) => {
      const belowChapterInputs = getBelowChapterInputs(chapterIndex);
      if (belowChapterInputs.length === 0) return;

      const opId = Date.now();
      setPendingBelowRule({
        anchorIndex: chapterIndex,
        targetReadState: shouldMarkBelowAsRead,
        opId,
      });

      setBelowChaptersReadState(
        {
          sourceId,
          mangaId,
          chapters: belowChapterInputs,
          markAsRead: shouldMarkBelowAsRead,
        },
        {
          onError: () => {
            setPendingBelowRule((currentRule) => {
              if (!currentRule || currentRule.opId !== opId) {
                return currentRule;
              }
              return null;
            });
          },
          onSettled: () => {
            setPendingBelowRule((currentRule) => {
              if (!currentRule || currentRule.opId !== opId) {
                return currentRule;
              }
              return null;
            });
          },
        }
      );
    },
    [getBelowChapterInputs, mangaId, setBelowChaptersReadState, sourceId]
  );

  const clearPendingBelowRule = useCallback(() => {
    setPendingBelowRule(null);
  }, []);

  return {
    progressByChapterId,
    effectiveReadByChapterId,
    areAllBelowReadByIndex,
    isMutationPending,
    pendingBelowRule,
    isChapterRead,
    getBelowChapterInputs,
    toggleChapterRead,
    toggleBelowChaptersRead,
    clearPendingBelowRule,
  };
}
