export const libraryQueryFactory = {
  all: () => ["library"] as const,

  list: () => [...libraryQueryFactory.all(), "entries"] as const,

  entry: (sourceId: string, mangaId: string) =>
    [...libraryQueryFactory.all(), "entry", sourceId, mangaId] as const,
};
