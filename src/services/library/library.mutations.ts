import { useMutation, useQueryClient } from "@tanstack/react-query";
import { libraryQueryFactory } from "./library.queryFactory";
import { removeLibraryEntry, upsertLibraryEntry } from "./library.repository";
import type { UpsertLibraryEntryInput } from "./library.types";

const invalidateLibraryQueries = async (
  sourceId: string,
  mangaId: string,
  queryClient: ReturnType<typeof useQueryClient>
) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: libraryQueryFactory.list() }),
    queryClient.invalidateQueries({
      queryKey: libraryQueryFactory.entry(sourceId, mangaId),
    }),
  ]);
};

export const useUpsertLibraryEntryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpsertLibraryEntryInput) => {
      upsertLibraryEntry(input);
    },
    onSuccess: async (_result, input) => {
      await invalidateLibraryQueries(input.sourceId, input.mangaId, queryClient);
    },
  });
};

export const useRemoveLibraryEntryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { sourceId: string; mangaId: string }) => {
      removeLibraryEntry(input.sourceId, input.mangaId);
    },
    onSuccess: async (_result, input) => {
      await invalidateLibraryQueries(input.sourceId, input.mangaId, queryClient);
    },
  });
};
