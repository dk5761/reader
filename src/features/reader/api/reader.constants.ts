import type { ReaderArticleListOptions } from "./reader.types";

export const readerApiRoutes = {
  articles: "/articles",
  articleById: (articleId: string) => `/articles/${articleId}`,
} as const;

const appendIfPresent = (
  params: URLSearchParams,
  key: string,
  value: string | number | undefined
) => {
  if (value !== undefined && value !== "") {
    params.append(key, String(value));
  }
};

export const getArticlesUrl = (options?: ReaderArticleListOptions) => {
  const params = new URLSearchParams();

  appendIfPresent(params, "page", options?.page);
  appendIfPresent(params, "limit", options?.limit);
  appendIfPresent(params, "query", options?.query);
  appendIfPresent(params, "feed_id", options?.feed_id);

  const queryString = params.toString();
  return queryString
    ? `${readerApiRoutes.articles}?${queryString}`
    : readerApiRoutes.articles;
};
