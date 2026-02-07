import { queryOptions } from "@tanstack/react-query";
import { get } from "@/services/api";
import { queryFactory } from "./queryFactory";
import { getArticlesUrl, readerApiRoutes } from "./reader.constants";
import type {
  ReaderArticle,
  ReaderArticleListOptions,
  ReaderArticlesResponse,
} from "./reader.types";

export const getArticlesQuery = (options?: ReaderArticleListOptions) =>
  queryOptions({
    queryKey: queryFactory.getArticles(options),
    queryFn: async () => get<ReaderArticlesResponse>(getArticlesUrl(options)),
  });

export const getArticleByIdQuery = (
  articleId: string,
  enabled: boolean = true
) =>
  queryOptions({
    queryKey: queryFactory.getArticleById(articleId),
    queryFn: async () => get<ReaderArticle>(readerApiRoutes.articleById(articleId)),
    enabled,
  });
