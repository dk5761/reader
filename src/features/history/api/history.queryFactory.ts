import type { GetGroupedReadingHistoryInput } from "@/services/history";

const getGroupedHistoryParams = (input: GetGroupedReadingHistoryInput = {}) => ({
  entryLimit: Math.max(1, input.entryLimit ?? 100),
  perMangaChapterLimit: Math.max(1, input.perMangaChapterLimit ?? 5),
});

export const historyQueryFactory = {
  all: () => ["history"] as const,

  grouped: (input?: GetGroupedReadingHistoryInput) =>
    [...historyQueryFactory.all(), "grouped", getGroupedHistoryParams(input)] as const,

  mangaLatest: (sourceId: string, mangaId: string) =>
    [...historyQueryFactory.all(), "manga-latest", sourceId, mangaId] as const,

  mangaTimeline: (sourceId: string, mangaId: string) =>
    [...historyQueryFactory.all(), "manga-timeline", sourceId, mangaId] as const,

  mangaTimelinePage: (sourceId: string, mangaId: string, pageSize: number) =>
    [...historyQueryFactory.mangaTimeline(sourceId, mangaId), pageSize] as const,
};
