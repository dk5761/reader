import { queryOptions } from "@tanstack/react-query";
import {
  getLibraryUpdateRunSnapshot,
  getRecentLibraryUpdateEvents,
} from "@/services/library-update";
import { libraryUpdateQueryFactory } from "./libraryUpdate.queryFactory";

export const libraryUpdateSnapshotQueryOptions = () =>
  queryOptions({
    queryKey: libraryUpdateQueryFactory.snapshot(),
    queryFn: () => getLibraryUpdateRunSnapshot(),
  });

export const recentLibraryUpdateEventsQueryOptions = (limit = 8) =>
  queryOptions({
    queryKey: libraryUpdateQueryFactory.events(limit),
    queryFn: () => getRecentLibraryUpdateEvents(limit),
  });
