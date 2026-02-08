export const libraryUpdateQueryFactory = {
  all: () => ["settings", "library-update"] as const,

  snapshot: () => [...libraryUpdateQueryFactory.all(), "snapshot"] as const,

  events: (limit: number) =>
    [...libraryUpdateQueryFactory.all(), "events", Math.max(1, limit)] as const,
};
