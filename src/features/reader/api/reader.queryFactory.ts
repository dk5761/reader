export const readerQueryFactory = {
  all: () => ["reader"] as const,

  session: (sourceId: string, mangaId: string, chapterId: string) =>
    [...readerQueryFactory.all(), "session", sourceId, mangaId, chapterId] as const,

  chapterPages: (sourceId: string, chapterId: string) =>
    [...readerQueryFactory.all(), "chapter-pages", sourceId, chapterId] as const,
};
