import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  cancelLibraryUpdateRun,
  pauseLibraryUpdateRun,
  resumeLibraryUpdateRun,
  startLibraryUpdateRun,
} from "@/services/library-update";
import { libraryQueryFactory } from "@/services/library/library.queryFactory";
import { libraryUpdateQueryFactory } from "./libraryUpdate.queryFactory";

const invalidateUpdateQueries = async (queryClient: ReturnType<typeof useQueryClient>) => {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: libraryUpdateQueryFactory.snapshot(),
    }),
    queryClient.invalidateQueries({
      queryKey: libraryUpdateQueryFactory.all(),
    }),
  ]);
};

export const useStartLibraryUpdateMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => startLibraryUpdateRun(),
    onSuccess: async () => {
      await Promise.all([
        invalidateUpdateQueries(queryClient),
        queryClient.invalidateQueries({ queryKey: libraryQueryFactory.all() }),
      ]);
    },
  });
};

export const usePauseLibraryUpdateMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => pauseLibraryUpdateRun(),
    onSuccess: async () => {
      await invalidateUpdateQueries(queryClient);
    },
  });
};

export const useResumeLibraryUpdateMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => resumeLibraryUpdateRun(),
    onSuccess: async () => {
      await invalidateUpdateQueries(queryClient);
    },
  });
};

export const useCancelLibraryUpdateMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => cancelLibraryUpdateRun(),
    onSuccess: async () => {
      await Promise.all([
        invalidateUpdateQueries(queryClient),
        queryClient.invalidateQueries({ queryKey: libraryQueryFactory.all() }),
      ]);
    },
  });
};
