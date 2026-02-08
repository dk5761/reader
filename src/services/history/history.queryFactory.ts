export const historyQueryFactory = {
  all: () => ["history"] as const,

  latest: (limit = 50) => [...historyQueryFactory.all(), "latest", limit] as const,

  mangaLatest: (sourceId: string, mangaId: string) =>
    [...historyQueryFactory.all(), "manga-latest", sourceId, mangaId] as const,
};
