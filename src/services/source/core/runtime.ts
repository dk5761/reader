import { SourceCapabilityError } from "./errors";
import { sourceRegistry } from "./registry";
import type {
  SourceAdapter,
  SourceAdapterContext,
  SourceChapter,
  SourceDescriptor,
  SourceId,
  SourceListParams,
  SourceManga,
  SourceMangaDetails,
  SourcePagedResult,
  SourcePage,
  SourceSearchParams,
} from "./types";
import { sourceRequestClient } from "../http/request";

const createSourceContext = (): SourceAdapterContext => ({
  http: sourceRequestClient,
});

const runWithAdapter = async <T>(
  sourceId: SourceId,
  operation: (adapter: SourceAdapter, context: SourceAdapterContext) => Promise<T>
): Promise<T> => {
  const source = sourceRegistry.require(sourceId);
  return operation(source, createSourceContext());
};

export const listRegisteredSources = (): SourceDescriptor[] => sourceRegistry.list();

export const getSourceDescriptor = (sourceId: SourceId): SourceDescriptor =>
  sourceRegistry.require(sourceId).descriptor;

export const searchSourceManga = (
  sourceId: SourceId,
  params: SourceSearchParams
): Promise<SourcePagedResult<SourceManga>> =>
  runWithAdapter(sourceId, (source, context) => source.search(params, context));

export const getSourceMangaDetails = (
  sourceId: SourceId,
  mangaId: string
): Promise<SourceMangaDetails> =>
  runWithAdapter(sourceId, (source, context) =>
    source.getMangaDetails(mangaId, context)
  );

export const getSourceChapters = (
  sourceId: SourceId,
  mangaId: string
): Promise<SourceChapter[]> =>
  runWithAdapter(sourceId, (source, context) => source.getChapters(mangaId, context));

export const getSourceChapterPages = (
  sourceId: SourceId,
  chapterId: string
): Promise<SourcePage[]> =>
  runWithAdapter(sourceId, (source, context) =>
    source.getChapterPages(chapterId, context)
  );

export const getSourceLatestUpdates = async (
  sourceId: SourceId,
  params: SourceListParams = {}
): Promise<SourcePagedResult<SourceManga>> =>
  runWithAdapter(sourceId, async (source, context) => {
    if (!source.getLatestUpdates) {
      throw new SourceCapabilityError(sourceId, "getLatestUpdates");
    }

    return source.getLatestUpdates(params, context);
  });

export const getSourcePopularTitles = async (
  sourceId: SourceId,
  params: SourceListParams = {}
): Promise<SourcePagedResult<SourceManga>> =>
  runWithAdapter(sourceId, async (source, context) => {
    if (!source.getPopularTitles) {
      throw new SourceCapabilityError(sourceId, "getPopularTitles");
    }

    return source.getPopularTitles(params, context);
  });
