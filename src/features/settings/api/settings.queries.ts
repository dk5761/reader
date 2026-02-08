import { queryOptions } from "@tanstack/react-query";
import { getAppSettings } from "@/services/settings";
import { settingsQueryFactory } from "./settings.queryFactory";

export const appSettingsQueryOptions = () =>
  queryOptions({
    queryKey: settingsQueryFactory.app(),
    queryFn: () => getAppSettings(),
  });
