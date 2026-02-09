export const libraryQueryFactory = {
  all: () => ["library"] as const,

  list: () => [...libraryQueryFactory.all(), "entries"] as const,

  listWithCategories: (signature: string) =>
    [...libraryQueryFactory.all(), "entries-with-categories", signature] as const,

  entry: (sourceId: string, mangaId: string) =>
    [...libraryQueryFactory.all(), "entry", sourceId, mangaId] as const,

  categories: () => [...libraryQueryFactory.all(), "categories"] as const,

  viewSettings: () => [...libraryQueryFactory.all(), "view-settings"] as const,
};
