import { queryOptions } from "@tanstack/react-query";
import { searchSourceManga } from "@/services/source";
import { globalSearchQueryFactory } from "./globalSearch.queryFactory";

interface GlobalSourceSearchPreviewQueryOptionsInput {
  sourceId: string;
  query: string;
  enabled: boolean;
}

export const globalSourceSearchPreviewQueryOptions = (
  params: GlobalSourceSearchPreviewQueryOptionsInput
) => {
  const trimmedQuery = params.query.trim();

  return queryOptions({
    queryKey: globalSearchQueryFactory.source(params.sourceId, trimmedQuery),
    queryFn: async ({ signal }) =>
      searchSourceManga(
        params.sourceId,
        {
          page: 1,
          query: trimmedQuery,
        },
        signal
      ),
    enabled: params.enabled && trimmedQuery.length >= 2,
  });
};
