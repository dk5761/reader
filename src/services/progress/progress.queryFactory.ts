export const progressQueryFactory = {
  all: () => ["progress"] as const,

  latest: (limit = 50) => [...progressQueryFactory.all(), "latest", limit] as const,

  latestByManga: (sourceId: string, mangaId: string) =>
    [...progressQueryFactory.all(), "manga-latest", sourceId, mangaId] as const,

  byChapter: (sourceId: string, mangaId: string, chapterId: string) =>
    [...progressQueryFactory.all(), "chapter", sourceId, mangaId, chapterId] as const,
};
