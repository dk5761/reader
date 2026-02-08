export const settingsQueryFactory = {
  all: () => ["settings"] as const,

  app: () => [...settingsQueryFactory.all(), "app"] as const,
};
