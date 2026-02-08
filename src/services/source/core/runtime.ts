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

const createSourceContext = (signal?: AbortSignal): SourceAdapterContext => {
  if (!signal) {
    return {
      http: sourceRequestClient,
    };
  }

  return {
    http: {
      request: (options) =>
        sourceRequestClient.request({
          ...options,
          signal: options.signal ?? signal,
        }),
      get: (url, options) =>
        sourceRequestClient.get(url, {
          ...options,
          signal: options?.signal ?? signal,
        }),
      post: (url, data, options) =>
        sourceRequestClient.post(url, data, {
          ...options,
          signal: options?.signal ?? signal,
        }),
    },
  };
};

const runWithAdapter = async <T>(
  sourceId: SourceId,
  operation: (adapter: SourceAdapter, context: SourceAdapterContext) => Promise<T>,
  signal?: AbortSignal
): Promise<T> => {
  const source = sourceRegistry.require(sourceId);
  return operation(source, createSourceContext(signal));
};

export const listRegisteredSources = (): SourceDescriptor[] => sourceRegistry.list();

export const getSourceDescriptor = (sourceId: SourceId): SourceDescriptor =>
  sourceRegistry.require(sourceId).descriptor;

export const searchSourceManga = (
  sourceId: SourceId,
  params: SourceSearchParams,
  signal?: AbortSignal
): Promise<SourcePagedResult<SourceManga>> =>
  runWithAdapter(sourceId, (source, context) => source.search(params, context), signal);

export const getSourceMangaDetails = (
  sourceId: SourceId,
  mangaId: string,
  signal?: AbortSignal
): Promise<SourceMangaDetails> =>
  runWithAdapter(
    sourceId,
    (source, context) => source.getMangaDetails(mangaId, context),
    signal
  );

export const getSourceChapters = (
  sourceId: SourceId,
  mangaId: string,
  signal?: AbortSignal
): Promise<SourceChapter[]> =>
  runWithAdapter(
    sourceId,
    (source, context) => source.getChapters(mangaId, context),
    signal
  );

export const getSourceChapterPages = (
  sourceId: SourceId,
  chapterId: string,
  signal?: AbortSignal
): Promise<SourcePage[]> =>
  runWithAdapter(
    sourceId,
    (source, context) => source.getChapterPages(chapterId, context),
    signal
  );

export const getSourceLatestUpdates = async (
  sourceId: SourceId,
  params: SourceListParams = {},
  signal?: AbortSignal
): Promise<SourcePagedResult<SourceManga>> =>
  runWithAdapter(
    sourceId,
    async (source, context) => {
      if (!source.getLatestUpdates) {
        throw new SourceCapabilityError(sourceId, "getLatestUpdates");
      }

      return source.getLatestUpdates(params, context);
    },
    signal
  );

export const getSourcePopularTitles = async (
  sourceId: SourceId,
  params: SourceListParams = {},
  signal?: AbortSignal
): Promise<SourcePagedResult<SourceManga>> =>
  runWithAdapter(
    sourceId,
    async (source, context) => {
      if (!source.getPopularTitles) {
        throw new SourceCapabilityError(sourceId, "getPopularTitles");
      }

      return source.getPopularTitles(params, context);
    },
    signal
  );
