const normalizeQuery = (query: string) => query.trim().toLowerCase();

export const globalSearchQueryFactory = {
  all: () => ["browse", "global-search"] as const,

  source: (sourceId: string, query: string) =>
    [...globalSearchQueryFactory.all(), "source", sourceId, { query: normalizeQuery(query) }] as const,
};
