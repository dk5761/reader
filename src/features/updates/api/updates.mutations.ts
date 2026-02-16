import { useMutation, useQueryClient } from "@tanstack/react-query";
import { libraryQueryFactory } from "@/services/library";
import {
  cancelLibraryUpdateRun,
  markLibraryUpdatesSeenToLatest,
  pauseLibraryUpdateRun,
  resumeLibraryUpdateRun,
  startLibraryUpdateRun,
} from "@/services/library-update";
import { updatesQueryFactory } from "./updates.queryFactory";

const invalidateUpdatesQueries = async (
  queryClient: ReturnType<typeof useQueryClient>
) => {
  await queryClient.invalidateQueries({
    queryKey: updatesQueryFactory.all(),
  });
};

export const useStartLibraryUpdateRunMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => startLibraryUpdateRun(),
    onSuccess: async () => {
      await Promise.all([
        invalidateUpdatesQueries(queryClient),
        queryClient.invalidateQueries({ queryKey: libraryQueryFactory.all() }),
      ]);
    },
  });
};

export const usePauseLibraryUpdateRunMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => pauseLibraryUpdateRun(),
    onSuccess: async () => {
      await invalidateUpdatesQueries(queryClient);
    },
  });
};

export const useResumeLibraryUpdateRunMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => resumeLibraryUpdateRun(),
    onSuccess: async () => {
      await invalidateUpdatesQueries(queryClient);
    },
  });
};

export const useCancelLibraryUpdateRunMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => cancelLibraryUpdateRun(),
    onSuccess: async () => {
      await Promise.all([
        invalidateUpdatesQueries(queryClient),
        queryClient.invalidateQueries({ queryKey: libraryQueryFactory.all() }),
      ]);
    },
  });
};

export const useMarkLibraryUpdatesSeenMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => markLibraryUpdatesSeenToLatest(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: updatesQueryFactory.feedState() }),
        queryClient.invalidateQueries({ queryKey: updatesQueryFactory.eventsAll() }),
      ]);
    },
  });
};
