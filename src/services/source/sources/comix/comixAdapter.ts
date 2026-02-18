import type {
  SourceAdapter,
  SourceAdapterContext,
  SourceChapter,
  SourceManga,
  SourceMangaDetails,
  SourcePage,
  SourceSearchParams,
} from "../../core";
import type {
  ComixChapter,
  ComixChapterListResponse,
  ComixChapterResponse,
  ComixManga,
  ComixPoster,
  ComixSearchResponse,
  ComixSingleMangaResponse,
} from "./types";

const COMIX_SOURCE_ID = "comix";
const COMIX_BASE_URL = "https://comix.to";
const COMIX_API_BASE_URL = `${COMIX_BASE_URL}/api/v2/`;

const NSFW_GENRE_IDS = ["87264", "8", "87265", "13", "87266", "87268"];

const cleanText = (value: string | null | undefined): string =>
  (value ?? "").replace(/\s+/g, " ").trim();

const toAbsoluteUrl = (pathOrUrl: string): string => {
  const value = cleanText(pathOrUrl);
  if (!value) {
    return "";
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  if (value.startsWith("//")) {
    return `https:${value}`;
  }

  if (value.startsWith("/")) {
    return `${COMIX_BASE_URL}${value}`;
  }

  return `${COMIX_BASE_URL}/${value}`;
};

const getPosterUrl = (poster: ComixPoster | null | undefined): string =>
  toAbsoluteUrl(
    cleanText(poster?.large) || cleanText(poster?.medium) || cleanText(poster?.small)
  );

const mapStatus = (status: string | null | undefined): SourceMangaDetails["status"] => {
  switch (cleanText(status).toLowerCase()) {
    case "releasing":
      return "ongoing";
    case "finished":
      return "completed";
    case "on_hiatus":
      return "hiatus";
    case "discontinued":
      return "cancelled";
    default:
      return "unknown";
  }
};

const mapManga = (manga: ComixManga): SourceManga => {
  const hashId = cleanText(manga.hash_id);
  return {
    id: hashId,
    title: cleanText(manga.title),
    url: `${COMIX_BASE_URL}/${hashId}`,
    thumbnailUrl: getPosterUrl(manga.poster) || undefined,
  };
};

const mapMangaDetails = (manga: ComixManga): SourceMangaDetails => {
  const hashId = cleanText(manga.hash_id);
  const authors = (manga.author ?? []).map((entry) => cleanText(entry.title)).filter(Boolean);
  const artists = (manga.artist ?? []).map((entry) => cleanText(entry.title)).filter(Boolean);

  const genres = new Set<string>();
  const typeMap: Record<string, string> = {
    manhwa: "Manhwa",
    manhua: "Manhua",
    manga: "Manga",
  };

  const normalizedType = cleanText(manga.type).toLowerCase();
  if (normalizedType && typeMap[normalizedType]) {
    genres.add(typeMap[normalizedType]);
  }

  manga.genre?.forEach((entry) => {
    const value = cleanText(entry.title);
    if (value) {
      genres.add(value);
    }
  });
  manga.theme?.forEach((entry) => {
    const value = cleanText(entry.title);
    if (value) {
      genres.add(value);
    }
  });
  manga.demographic?.forEach((entry) => {
    const value = cleanText(entry.title);
    if (value) {
      genres.add(value);
    }
  });
  if (manga.is_nsfw) {
    genres.add("NSFW");
  }

  return {
    id: hashId,
    title: cleanText(manga.title),
    url: `${COMIX_BASE_URL}/${hashId}`,
    thumbnailUrl: getPosterUrl(manga.poster) || undefined,
    description: cleanText(manga.synopsis) || undefined,
    alternativeTitles: (manga.alt_titles ?? []).map(cleanText).filter(Boolean),
    authors,
    artists,
    genres: Array.from(genres),
    status: mapStatus(manga.status),
  };
};

const toChapterDate = (unixTimestamp?: number): string | undefined => {
  if (!Number.isFinite(unixTimestamp)) {
    return undefined;
  }

  const date = new Date((unixTimestamp as number) * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().split("T")[0];
};

const mapChapter = (chapter: ComixChapter, mangaId: string): SourceChapter => {
  const chapterId = String(chapter.chapter_id);
  const numberLabel = String(chapter.number).replace(/\.0$/, "");
  const chapterName = cleanText(chapter.name);
  const title = chapterName ? `Chapter ${numberLabel}: ${chapterName}` : `Chapter ${numberLabel}`;

  let scanlator = cleanText(chapter.scanlation_group?.name);
  if (!scanlator) {
    scanlator = chapter.is_official === 1 ? "Official" : "Unknown";
  }

  return {
    id: chapterId,
    title,
    url: `${COMIX_BASE_URL}/title/${mangaId}/${chapterId}`,
    number: Number.isFinite(chapter.number) ? chapter.number : undefined,
    uploadedAt: toChapterDate(chapter.updated_at),
    scanlator,
  };
};

const deduplicateChapters = (chapters: ComixChapter[]): ComixChapter[] => {
  const chapterMap = new Map<number, ComixChapter>();

  chapters.forEach((chapter) => {
    const existing = chapterMap.get(chapter.number);
    if (!existing) {
      chapterMap.set(chapter.number, chapter);
      return;
    }

    const currentIsOfficial =
      chapter.is_official === 1 || chapter.scanlation_group_id === 9275;
    const existingIsOfficial =
      existing.is_official === 1 || existing.scanlation_group_id === 9275;

    let shouldReplace = false;

    if (currentIsOfficial && !existingIsOfficial) {
      shouldReplace = true;
    } else if (!currentIsOfficial && existingIsOfficial) {
      shouldReplace = false;
    } else {
      const currentVotes = chapter.votes ?? 0;
      const existingVotes = existing.votes ?? 0;
      if (currentVotes > existingVotes) {
        shouldReplace = true;
      } else if (currentVotes < existingVotes) {
        shouldReplace = false;
      } else {
        shouldReplace = (chapter.updated_at ?? 0) > (existing.updated_at ?? 0);
      }
    }

    if (shouldReplace) {
      chapterMap.set(chapter.number, chapter);
    }
  });

  return Array.from(chapterMap.values());
};

const extractHashId = (mangaIdOrUrl: string): string => {
  const value = cleanText(mangaIdOrUrl).replace(/^\/+/, "");
  if (!value) {
    return "";
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const parsed = new URL(value);
      const segments = parsed.pathname.split("/").filter(Boolean);
      return segments[segments.length - 1] ?? "";
    } catch {
      return value;
    }
  }

  return value.split("/")[0] ?? value;
};

const extractChapterId = (chapterIdOrUrl: string): string => {
  const value = cleanText(chapterIdOrUrl).replace(/^\/+/, "");
  if (!value) {
    return "";
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const parsed = new URL(value);
      const segments = parsed.pathname.split("/").filter(Boolean);
      return segments[segments.length - 1] ?? "";
    } catch {
      return value;
    }
  }

  const segments = value.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? value;
};

const buildApiUrl = (
  endpoint: string,
  params: Record<string, string | number | string[]> = {}
): string => {
  const url = new URL(endpoint, COMIX_API_BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => url.searchParams.append(key, String(item)));
      return;
    }
    url.searchParams.append(key, String(value));
  });
  return url.toString();
};

const withNsfwFilter = (
  params: Record<string, string | number | string[]>
): Record<string, string | number | string[]> => {
  const genres = params["genres[]"];
  const genreValues = Array.isArray(genres) ? [...genres] : genres ? [String(genres)] : [];
  NSFW_GENRE_IDS.forEach((genreId) => {
    genreValues.push(`-${genreId}`);
  });
  return {
    ...params,
    "genres[]": genreValues,
  };
};

const requestJson = async <T>(
  context: SourceAdapterContext,
  url: string
): Promise<T> => {
  const response = await context.http.get<T>(url, {
    headers: {
      Referer: `${COMIX_BASE_URL}/`,
    },
  });
  return response.data;
};

const hasNextPage = (currentPage: number, lastPage: number): boolean =>
  Number.isFinite(currentPage) &&
  Number.isFinite(lastPage) &&
  currentPage < lastPage;

const fetchSearchPage = async (
  context: SourceAdapterContext,
  params: SourceSearchParams
) => {
  const page = params.page ?? 1;
  const query = cleanText(params.query);
  const baseParams: Record<string, string | number | string[]> = {
    limit: 50,
    page,
  };

  if (query) {
    baseParams.keyword = query;
    baseParams["order[relevance]"] = "desc";
  } else {
    baseParams["order[views_30d]"] = "desc";
  }

  const url = buildApiUrl("manga", withNsfwFilter(baseParams));
  const json = await requestJson<ComixSearchResponse>(context, url);
  return {
    items: (json.result.items ?? []).map(mapManga).filter((item) => Boolean(item.id)),
    page,
    hasNextPage: hasNextPage(
      json.result.pagination.current_page,
      json.result.pagination.last_page
    ),
  };
};

export const comixAdapter: SourceAdapter = {
  descriptor: {
    id: COMIX_SOURCE_ID,
    name: "Comix",
    language: "en",
    baseUrl: COMIX_BASE_URL,
    supportsSearch: true,
    supportsPopular: true,
    supportsLatest: true,
    supportsFilters: false,
  },

  async search(params, context) {
    return fetchSearchPage(context, params);
  },

  async getPopularTitles(params, context) {
    return fetchSearchPage(context, {
      query: "",
      page: params.page,
      limit: params.limit,
    });
  },

  async getLatestUpdates(params, context) {
    const page = params.page ?? 1;
    const url = buildApiUrl(
      "manga",
      withNsfwFilter({
        "order[chapter_updated_at]": "desc",
        limit: 50,
        page,
      })
    );

    const json = await requestJson<ComixSearchResponse>(context, url);
    return {
      items: (json.result.items ?? []).map(mapManga).filter((item) => Boolean(item.id)),
      page,
      hasNextPage: hasNextPage(
        json.result.pagination.current_page,
        json.result.pagination.last_page
      ),
    };
  },

  async getMangaDetails(mangaId, context) {
    const hashId = extractHashId(mangaId);
    const url = buildApiUrl(`manga/${hashId}`, {
      "includes[]": [
        "demographic",
        "genre",
        "theme",
        "author",
        "artist",
        "publisher",
      ],
    });

    const json = await requestJson<ComixSingleMangaResponse>(context, url);
    return mapMangaDetails(json.result);
  },

  async getChapters(mangaId, context) {
    const hashId = extractHashId(mangaId);
    let currentPage = 1;
    let shouldContinue = true;
    const allChapters: ComixChapter[] = [];

    while (shouldContinue) {
      const url = buildApiUrl(`manga/${hashId}/chapters`, {
        "order[number]": "desc",
        limit: 100,
        page: currentPage,
      });

      const json = await requestJson<ComixChapterListResponse>(context, url);
      allChapters.push(...(json.result.items ?? []));

      shouldContinue = hasNextPage(
        json.result.pagination.current_page,
        json.result.pagination.last_page
      );
      currentPage += 1;
    }

    return deduplicateChapters(allChapters).map((chapter) => mapChapter(chapter, hashId));
  },

  async getChapterPages(chapterId, context): Promise<SourcePage[]> {
    const parsedChapterId = extractChapterId(chapterId);
    const url = buildApiUrl(`chapters/${parsedChapterId}`);
    const json = await requestJson<ComixChapterResponse>(context, url);
    const images = json.result?.images ?? [];

    // Extract chapter number from chapterId
    const chapterNumber = parseFloat(parsedChapterId);

    return images
      .map((image, index) => ({
        index,
        imageUrl: toAbsoluteUrl(image.url),
        headers: {
          Referer: `${COMIX_BASE_URL}/`,
        },
        chapterTitle: `Chapter ${parsedChapterId}`,
        chapterNumber: Number.isFinite(chapterNumber) ? chapterNumber : undefined,
      }))
      .filter((page) => Boolean(page.imageUrl));
  },
};
