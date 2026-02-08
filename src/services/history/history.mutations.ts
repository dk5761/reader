import { useMutation, useQueryClient } from "@tanstack/react-query";
import { historyQueryFactory } from "./history.queryFactory";
import { upsertReadingHistoryEntry } from "./history.repository";
import type { UpsertReadingHistoryInput } from "./history.types";

export const useUpsertReadingHistoryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpsertReadingHistoryInput) => {
      upsertReadingHistoryEntry(input);
    },
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: historyQueryFactory.all(),
        }),
        queryClient.invalidateQueries({
          queryKey: historyQueryFactory.mangaLatest(input.sourceId, input.mangaId),
        }),
      ]);
    },
  });
};
