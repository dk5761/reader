export interface UpdatesEventsQueryKeyInput {
  sourceId?: string;
  todayOnly: boolean;
  unreadOnly: boolean;
  lastSeenEventId?: number | null;
  pageSize: number;
  dayStartTs: number | null;
}

export const updatesQueryFactory = {
  all: () => ["updates"] as const,

  runSnapshot: () => [...updatesQueryFactory.all(), "run", "snapshot"] as const,

  feedState: () => [...updatesQueryFactory.all(), "feed-state"] as const,

  eventsAll: () => [...updatesQueryFactory.all(), "events"] as const,

  events: (input: UpdatesEventsQueryKeyInput) =>
    [...updatesQueryFactory.eventsAll(), input] as const,
};
