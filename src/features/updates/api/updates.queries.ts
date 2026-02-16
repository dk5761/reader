import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import {
  getLibraryUpdateEventsPage,
  getLibraryUpdateFeedState,
  getLibraryUpdateRunSnapshot,
} from "@/services/library-update";
import { updatesQueryFactory } from "./updates.queryFactory";

export interface UpdatesEventsQueryInput {
  sourceId?: string;
  todayOnly: boolean;
  unreadOnly: boolean;
  lastSeenEventId?: number | null;
  pageSize?: number;
  enabled?: boolean;
}

const getLocalDayStartTimestamp = (): number => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
};

export const updatesRunSnapshotQueryOptions = () =>
  queryOptions({
    queryKey: updatesQueryFactory.runSnapshot(),
    queryFn: () => getLibraryUpdateRunSnapshot(),
  });

export const updatesFeedStateQueryOptions = () =>
  queryOptions({
    queryKey: updatesQueryFactory.feedState(),
    queryFn: () => getLibraryUpdateFeedState(),
  });

export const updatesEventsInfiniteQueryOptions = (
  input: UpdatesEventsQueryInput
) => {
  const pageSize = Math.max(1, input.pageSize ?? 30);
  const dayStartTs = input.todayOnly ? getLocalDayStartTimestamp() : null;

  return infiniteQueryOptions({
    queryKey: updatesQueryFactory.events({
      sourceId: input.sourceId,
      todayOnly: input.todayOnly,
      unreadOnly: input.unreadOnly,
      lastSeenEventId: input.lastSeenEventId,
      pageSize,
      dayStartTs,
    }),
    queryFn: ({ pageParam }) =>
      getLibraryUpdateEventsPage({
        cursor: pageParam ?? undefined,
        limit: pageSize,
        sourceId: input.sourceId,
        detectedAfterTs: dayStartTs ?? undefined,
        unreadOnly: input.unreadOnly,
        lastSeenEventId: input.lastSeenEventId,
      }),
    enabled: input.enabled,
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
};
