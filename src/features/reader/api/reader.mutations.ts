import { useMutation, useQueryClient } from "@tanstack/react-query";
import { patch, post, remove } from "@/services/api";
import { queryFactory } from "./queryFactory";
import { readerApiRoutes } from "./reader.constants";
import type {
  CreateArticlePayload,
  ReaderArticle,
  UpdateArticlePayload,
} from "./reader.types";

export const useCreateArticleMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateArticlePayload) =>
      post<ReaderArticle, CreateArticlePayload>(readerApiRoutes.articles, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryFactory.articles() });
    },
  });
};

export const useUpdateArticleMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      articleId,
      payload,
    }: {
      articleId: string;
      payload: UpdateArticlePayload;
    }) =>
      patch<ReaderArticle, UpdateArticlePayload>(
        readerApiRoutes.articleById(articleId),
        payload
      ),
    onSuccess: (article) => {
      queryClient.invalidateQueries({ queryKey: queryFactory.articles() });
      queryClient.invalidateQueries({
        queryKey: queryFactory.getArticleById(article.id),
      });
    },
  });
};

export const useDeleteArticleMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (articleId: string) =>
      remove<{ success: boolean }>(readerApiRoutes.articleById(articleId)),
    onSuccess: (_, articleId) => {
      queryClient.invalidateQueries({ queryKey: queryFactory.articles() });
      queryClient.removeQueries({
        queryKey: queryFactory.getArticleById(articleId),
      });
    },
  });
};
