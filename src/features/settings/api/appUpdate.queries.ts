import { queryOptions } from "@tanstack/react-query";
import { getAppUpdateSnapshot } from "@/services/app-update";
import { appUpdateQueryFactory } from "./appUpdate.queryFactory";

export const appUpdateSnapshotQueryOptions = () =>
  queryOptions({
    queryKey: appUpdateQueryFactory.snapshot(),
    queryFn: () => getAppUpdateSnapshot(),
  });
