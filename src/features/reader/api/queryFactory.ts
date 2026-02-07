import type { ReaderArticleListOptions } from "./reader.types";

const serializeOptions = (options?: ReaderArticleListOptions) => {
  if (!options) {
    return {};
  }

  const entries = Object.entries(options).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
};

export const queryFactory = {
  all: () => ["reader"] as const,

  articles: () => [...queryFactory.all(), "articles"] as const,

  getArticles: (options?: ReaderArticleListOptions) =>
    [...queryFactory.articles(), serializeOptions(options)] as const,

  getArticleById: (articleId: string) =>
    [...queryFactory.articles(), "detail", articleId] as const,
};
