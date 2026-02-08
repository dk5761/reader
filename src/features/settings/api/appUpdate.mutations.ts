import { useMutation, useQueryClient } from "@tanstack/react-query";
import { applyDownloadedUpdate, checkForAppUpdate } from "@/services/app-update";
import { appUpdateQueryFactory } from "./appUpdate.queryFactory";

const invalidateAppUpdateSnapshot = async (
  queryClient: ReturnType<typeof useQueryClient>
) => {
  await queryClient.invalidateQueries({
    queryKey: appUpdateQueryFactory.snapshot(),
  });
};

export const useCheckForAppUpdateMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => checkForAppUpdate({ manual: true }),
    onSuccess: async () => {
      await invalidateAppUpdateSnapshot(queryClient);
    },
    onError: async () => {
      await invalidateAppUpdateSnapshot(queryClient);
    },
  });
};

export const useApplyDownloadedUpdateMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => applyDownloadedUpdate(),
    onSuccess: async () => {
      await invalidateAppUpdateSnapshot(queryClient);
    },
    onError: async () => {
      await invalidateAppUpdateSnapshot(queryClient);
    },
  });
};
