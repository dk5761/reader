export const appUpdateQueryFactory = {
  all: () => ["settings", "app-update"] as const,

  snapshot: () => [...appUpdateQueryFactory.all(), "snapshot"] as const,
};
