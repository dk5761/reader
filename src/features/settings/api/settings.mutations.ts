import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateAppSettings, type UpdateAppSettingsInput } from "@/services/settings";
import { settingsQueryFactory } from "./settings.queryFactory";

export const useUpdateAppSettingsMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateAppSettingsInput) => updateAppSettings(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: settingsQueryFactory.all(),
      });
    },
  });
};
