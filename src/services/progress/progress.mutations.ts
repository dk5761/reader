import { useMutation, useQueryClient } from "@tanstack/react-query";
import { progressQueryFactory } from "./progress.queryFactory";
import { upsertReadingProgress } from "./progress.repository";
import type { UpsertReadingProgressInput } from "./progress.types";

export const useUpsertReadingProgressMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpsertReadingProgressInput) => {
      upsertReadingProgress(input);
    },
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: progressQueryFactory.byChapter(
            input.sourceId,
            input.mangaId,
            input.chapterId
          ),
        }),
        queryClient.invalidateQueries({
          queryKey: progressQueryFactory.latestByManga(input.sourceId, input.mangaId),
        }),
        queryClient.invalidateQueries({
          queryKey: progressQueryFactory.all(),
        }),
      ]);
    },
  });
};
