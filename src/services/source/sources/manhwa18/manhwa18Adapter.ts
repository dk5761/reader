import IDOMParser from "advanced-html-parser";
import { getCookieHeaderForUrl } from "@/services/cookies/cookieStore";
import type {
  SourceAdapter,
  SourceAdapterContext,
  SourceChapter,
  SourceManga,
  SourceMangaDetails,
  SourcePage,
} from "../../core";

const MANHWA18_SOURCE_ID = "manhwa18net";
const MANHWA18_BASE_URL = "https://manhwa18.net";
const DIRECT_URL_PREFIX = "url:";
const ACCEPT_HTML_HEADER =
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const MANHWA18_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:101.0) Gecko/20100101 Firefox/101.0";
const MANGA_REQUEST_CACHE_TTL_MS = 15000;

const GENERIC_WORDS_TO_REMOVE = new Set(["manhwa", "engsub"]);

interface HtmlElement {
  querySelector: (selector: string) => HtmlElement | null;
  querySelectorAll: (selector: string) => Set<HtmlElement>;
  getAttribute: (attributeName: string) => string;
  textContent?: string;
}

interface InertiaPaginated<T> {
  current_page?: number;
  data?: T[];
  last_page?: number;
  next_page_url?: string | null;
}

interface InertiaPage<TProps = Record<string, unknown>> {
  component?: string;
  props?: TProps;
  url?: string;
  version?: string;
}

interface Manhwa18Genre {
  id?: number;
  name?: string;
  slug?: string;
}

interface Manhwa18MangaItem {
  id?: number;
  name?: string;
  other_name?: string | null;
  cover_url?: string | null;
  thumb_url?: string | null;
  slug?: string;
  doujinshi?: string | null;
  pilot?: string | null;
  status_id?: number | null;
  genres?: Manhwa18Genre[];
  artists?: { name?: string }[];
}

interface Manhwa18ChapterItem {
  id?: number;
  name?: string;
  slug?: string;
  created_at?: string | null;
  updated_at?: string | null;
}

interface MangaListProps {
  paginate?: InertiaPaginated<Manhwa18MangaItem>;
}

interface MangaDetailProps {
  manga?: Manhwa18MangaItem;
  chapters?: Manhwa18ChapterItem[];
}

interface ChapterProps {
  chapterContent?: string;
}

const asArray = <T>(value: Set<T> | null | undefined): T[] => Array.from(value ?? []);

const cleanText = (value: string | null | undefined): string =>
  (value ?? "").replace(/\s+/g, " ").trim();

const isAbsoluteHttpUrl = (value: string): boolean =>
  value.startsWith("http://") || value.startsWith("https://");

const parseHtmlRoot = (html: string): HtmlElement => {
  const parsedDocument = IDOMParser.parse(html, { onlyBody: true });
  return parsedDocument.documentElement as unknown as HtmlElement;
};

const getAttributeTrimmed = (
  element: HtmlElement | null | undefined,
  attributeName: string
): string => (element?.getAttribute(attributeName) ?? "").trim();

const decodeHtmlEntities = (value: string): string =>
  value.replace(/&(#x[0-9a-fA-F]+|#\d+|quot|amp|lt|gt|apos|#039);/g, (entity, token) => {
    if (token === "quot") {
      return '"';
    }

    if (token === "amp") {
      return "&";
    }

    if (token === "lt") {
      return "<";
    }

    if (token === "gt") {
      return ">";
    }

    if (token === "apos" || token === "#039") {
      return "'";
    }

    if (token.startsWith("#x") || token.startsWith("#X")) {
      const parsed = Number.parseInt(token.slice(2), 16);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : entity;
    }

    if (token.startsWith("#")) {
      const parsed = Number.parseInt(token.slice(1), 10);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : entity;
    }

    return entity;
  });

const toAbsoluteUrl = (pathOrUrl: string): string => {
  const value = cleanText(pathOrUrl);
  if (!value) {
    return "";
  }

  if (value.startsWith("//")) {
    return `https:${value}`;
  }

  if (isAbsoluteHttpUrl(value)) {
    return value;
  }

  if (value.startsWith("/")) {
    return `${MANHWA18_BASE_URL}${value}`;
  }

  return `${MANHWA18_BASE_URL}/${value}`;
};

const toPathWithQuery = (pathOrUrl: string): string => {
  const value = cleanText(pathOrUrl);
  if (!value) {
    return "";
  }

  if (isAbsoluteHttpUrl(value)) {
    try {
      const parsed = new URL(value);
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return value;
    }
  }

  if (value.startsWith("/")) {
    return value;
  }

  return `/${value}`;
};

const parseAlternativeTitles = (value: string): string[] => {
  const unique = new Set<string>();
  value
    .split(/[,;]+/)
    .map(cleanText)
    .map((title) =>
      title
        .split(/\s+/)
        .filter((word) => !GENERIC_WORDS_TO_REMOVE.has(word.toLowerCase()))
        .join(" ")
        .trim()
    )
    .filter(Boolean)
    .forEach((entry) => unique.add(entry));

  return Array.from(unique);
};

const parseDate = (value: string | null | undefined): string | undefined => {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return undefined;
  }

  const timestamp = Date.parse(cleaned);
  if (Number.isNaN(timestamp)) {
    return cleaned;
  }

  return new Date(timestamp).toISOString().split("T")[0];
};

const parseChapterNumber = (title: string): number | undefined => {
  const match = cleanText(title).match(/([+-]?(?:\d*\.)?\d+)/);
  if (!match) {
    return undefined;
  }

  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeMangaPath = (mangaIdOrUrl: string): string => {
  const path = toPathWithQuery(mangaIdOrUrl).split("?")[0];
  if (!path) {
    return "";
  }

  const segments = path.split("/").filter(Boolean);
  if (!segments.length) {
    return "";
  }

  if (segments[0] === "manga" && segments[1]) {
    return `/manga/${segments[1]}`;
  }

  return `/manga/${segments[segments.length - 1]}`;
};

const normalizeChapterPath = (chapterIdOrUrl: string): string => {
  const path = toPathWithQuery(chapterIdOrUrl).split("?")[0];
  if (!path) {
    return "";
  }

  const segments = path.split("/").filter(Boolean);
  if (segments.length >= 3 && segments[0] === "manga") {
    return `/manga/${segments[1]}/${segments[2]}`;
  }

  return path;
};

const resolveMangaUrl = (mangaIdOrUrl: string): string =>
  toAbsoluteUrl(normalizeMangaPath(mangaIdOrUrl));

const resolveChapterUrl = (chapterIdOrUrl: string): string =>
  toAbsoluteUrl(normalizeChapterPath(chapterIdOrUrl));

const stripHtmlToText = (value: string): string => {
  const normalized = decodeHtmlEntities(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleanText(normalized.replace(/\n/g, " \n ")).replace(/ \n /g, "\n");
};

const extractInertiaPage = <TProps = Record<string, unknown>>(
  html: string
): InertiaPage<TProps> | null => {
  const root = parseHtmlRoot(html);
  const appElement = root.querySelector("#app");
  const rawDataPage = getAttributeTrimmed(appElement, "data-page");
  if (!rawDataPage) {
    return null;
  }

  try {
    return JSON.parse(decodeHtmlEntities(rawDataPage)) as InertiaPage<TProps>;
  } catch {
    return null;
  }
};

const toMangaPath = (slug: string): string => `/manga/${cleanText(slug).replace(/^\/+/, "")}`;

const toChapterPath = (mangaSlug: string, chapterSlug: string): string =>
  `/manga/${cleanText(mangaSlug).replace(/^\/+/, "")}/${cleanText(chapterSlug).replace(/^\/+/, "")}`;

const mapListManga = (item: Manhwa18MangaItem): SourceManga | null => {
  const slug = cleanText(item.slug);
  const title = cleanText(item.name);
  if (!slug || !title) {
    return null;
  }

  const path = toMangaPath(slug);
  return {
    id: path,
    title,
    url: toAbsoluteUrl(path),
    thumbnailUrl:
      toAbsoluteUrl(cleanText(item.cover_url) || cleanText(item.thumb_url)) || undefined,
  };
};

const mapStatus = (statusId: number | null | undefined): SourceMangaDetails["status"] => {
  if (statusId === 1) {
    return "completed";
  }

  if (statusId === 0) {
    return "ongoing";
  }

  return "unknown";
};

const parseListingFromInertia = (html: string): { items: SourceManga[]; hasNextPage: boolean } => {
  const page = extractInertiaPage<MangaListProps>(html);
  const entries = Array.isArray(page?.props?.paginate?.data) ? page!.props!.paginate!.data! : [];

  const mapped = entries
    .map((entry) => mapListManga(entry))
    .filter((item): item is SourceManga => Boolean(item));

  const deduplicated = new Map<string, SourceManga>();
  mapped.forEach((item) => {
    if (!deduplicated.has(item.id)) {
      deduplicated.set(item.id, item);
    }
  });

  return {
    items: Array.from(deduplicated.values()),
    hasNextPage: Boolean(page?.props?.paginate?.next_page_url),
  };
};

const parseMangaDetailsFromInertia = (fallbackMangaUrl: string, html: string): SourceMangaDetails => {
  const page = extractInertiaPage<MangaDetailProps>(html);
  const manga = page?.props?.manga;

  if (!manga || !cleanText(manga.slug)) {
    throw new Error("Unable to parse manga details from Manhwa18 response.");
  }

  const mangaPath = toMangaPath(cleanText(manga.slug));
  const description = stripHtmlToText(cleanText(manga.pilot));
  const alternativeTitles = parseAlternativeTitles(
    [cleanText(manga.other_name), cleanText(manga.doujinshi)].filter(Boolean).join(", ")
  );

  const authors = (manga.artists ?? [])
    .map((artist) => cleanText(artist?.name))
    .filter(Boolean);

  const genres = (manga.genres ?? [])
    .map((genre) => cleanText(genre?.name))
    .filter(Boolean);

  return {
    id: mangaPath,
    title: cleanText(manga.name),
    url: toAbsoluteUrl(mangaPath) || fallbackMangaUrl,
    thumbnailUrl:
      toAbsoluteUrl(cleanText(manga.cover_url) || cleanText(manga.thumb_url)) || undefined,
    description: description || undefined,
    alternativeTitles: alternativeTitles.length ? alternativeTitles : undefined,
    authors,
    genres,
    status: mapStatus(manga.status_id),
  };
};

const parseChaptersFromInertia = (html: string): SourceChapter[] => {
  const page = extractInertiaPage<MangaDetailProps>(html);
  const manga = page?.props?.manga;
  const chapters = Array.isArray(page?.props?.chapters) ? page!.props!.chapters! : [];

  const mangaSlug = cleanText(manga?.slug);
  if (!mangaSlug) {
    return [];
  }

  const mapped = chapters
    .map((chapter): SourceChapter | null => {
      const chapterSlug = cleanText(chapter.slug);
      const chapterTitle = cleanText(chapter.name);
      if (!chapterSlug || !chapterTitle) {
        return null;
      }

      const path = toChapterPath(mangaSlug, chapterSlug);
      return {
        id: path,
        title: chapterTitle,
        url: toAbsoluteUrl(path),
        number: parseChapterNumber(chapterTitle),
        uploadedAt: parseDate(chapter.created_at ?? chapter.updated_at),
      };
    })
    .filter((chapter): chapter is SourceChapter => Boolean(chapter));

  const deduplicated = new Map<string, SourceChapter>();
  mapped.forEach((chapter) => {
    if (!deduplicated.has(chapter.id)) {
      deduplicated.set(chapter.id, chapter);
    }
  });

  return Array.from(deduplicated.values());
};

const parseChapterPagesFromInertia = async (
  chapterUrl: string,
  html: string
): Promise<SourcePage[]> => {
  const page = extractInertiaPage<ChapterProps>(html);
  const chapterContent = page?.props?.chapterContent;

  // Try to extract chapter title from page title
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  let chapterTitle: string | undefined;
  let chapterNumber: number | undefined;

  if (titleMatch) {
    const rawTitle = titleMatch[1];
    // Title format is typically "Chapter X - Manga Title" or "Manga Name Chapter X"
    chapterTitle = cleanText(rawTitle);
    // Extract chapter number from title
    const numMatch = chapterTitle.match(/chapter\s*([+-]?(?:\d*\.)?\d+)/i);
    if (numMatch) {
      chapterNumber = parseFloat(numMatch[1]);
    }
  }

  const imageUrls = new Set<string>();
  if (chapterContent) {
    const imageTagMatches = chapterContent.matchAll(/(?:data-src|src)\s*=\s*["']([^"']+)["']/gi);
    for (const match of imageTagMatches) {
      const imageUrl = toAbsoluteUrl(cleanText(match[1]));
      if (imageUrl) {
        imageUrls.add(imageUrl);
      }
    }
  }

  if (!imageUrls.size) {
    const root = parseHtmlRoot(html);
    asArray(root.querySelectorAll("div#chapter-content img")).forEach((imageNode) => {
      const imageUrl = toAbsoluteUrl(
        cleanText(imageNode.getAttribute("data-src")) || cleanText(imageNode.getAttribute("src"))
      );
      if (imageUrl) {
        imageUrls.add(imageUrl);
      }
    });
  }

  const cookieHeader = await getCookieHeaderForUrl(chapterUrl);

  return Array.from(imageUrls).map((imageUrl, index) => {
    const headers: Record<string, string> = {
      Referer: `${MANHWA18_BASE_URL}/`,
      "User-Agent": MANHWA18_USER_AGENT,
    };

    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    return {
      index,
      imageUrl,
      headers,
      chapterTitle,
      chapterNumber,
    };
  });
};

const requestText = async (url: string, context: SourceAdapterContext): Promise<string> => {
  const response = await context.http.get<string>(url, {
    responseType: "text",
    headers: {
      Accept: ACCEPT_HTML_HEADER,
      Referer: `${MANHWA18_BASE_URL}/`,
      "User-Agent": MANHWA18_USER_AGENT,
    },
  });

  return typeof response.data === "string" ? response.data : String(response.data ?? "");
};

const mangaHtmlCache = new Map<string, { html: string; expiresAt: number }>();
const mangaHtmlInFlight = new Map<string, Promise<string>>();

const requestMangaText = async (
  mangaUrl: string,
  context: SourceAdapterContext
): Promise<string> => {
  const now = Date.now();
  const cached = mangaHtmlCache.get(mangaUrl);
  if (cached && cached.expiresAt > now) {
    return cached.html;
  }

  const inFlight = mangaHtmlInFlight.get(mangaUrl);
  if (inFlight) {
    return inFlight;
  }

  const requestPromise = requestText(mangaUrl, context)
    .then((html) => {
      mangaHtmlCache.set(mangaUrl, {
        html,
        expiresAt: Date.now() + MANGA_REQUEST_CACHE_TTL_MS,
      });
      return html;
    })
    .finally(() => {
      mangaHtmlInFlight.delete(mangaUrl);
    });

  mangaHtmlInFlight.set(mangaUrl, requestPromise);
  return requestPromise;
};

const buildListUrl = (params: URLSearchParams): string =>
  `${MANHWA18_BASE_URL}/manga-list?${params.toString()}`;

export const manhwa18Adapter: SourceAdapter = {
  descriptor: {
    id: MANHWA18_SOURCE_ID,
    name: "Manhwa18.net",
    language: "en",
    baseUrl: MANHWA18_BASE_URL,
    isNsfw: true,
    supportsSearch: true,
    supportsPopular: true,
    supportsLatest: true,
    supportsFilters: false,
  },

  async search(params, context) {
    const page = params.page ?? 1;
    const query = cleanText(params.query);

    if (query.toLowerCase().startsWith(DIRECT_URL_PREFIX)) {
      const directUrl = cleanText(query.slice(DIRECT_URL_PREFIX.length));
      if (!directUrl) {
        return { items: [], page, hasNextPage: false };
      }

      const mangaUrl = resolveMangaUrl(directUrl);
      const html = await requestText(mangaUrl, context);
      const details = parseMangaDetailsFromInertia(mangaUrl, html);

      return {
        items: [
          {
            id: details.id,
            title: details.title,
            url: details.url,
            thumbnailUrl: details.thumbnailUrl,
          },
        ].filter((item) => Boolean(item.id && item.title)),
        page,
        hasNextPage: false,
      };
    }

    const queryParams = new URLSearchParams({
      page: String(page),
    });

    if (query) {
      queryParams.set("q", query);
    }

    const html = await requestText(buildListUrl(queryParams), context);
    const parsed = parseListingFromInertia(html);

    return {
      items: parsed.items,
      page,
      hasNextPage: parsed.hasNextPage,
    };
  },

  async getPopularTitles(params, context) {
    const page = params.page ?? 1;
    const queryParams = new URLSearchParams({
      sort: "top",
      page: String(page),
    });

    const html = await requestText(buildListUrl(queryParams), context);
    const parsed = parseListingFromInertia(html);

    return {
      items: parsed.items,
      page,
      hasNextPage: parsed.hasNextPage,
    };
  },

  async getLatestUpdates(params, context) {
    const page = params.page ?? 1;
    const queryParams = new URLSearchParams({
      sort: "update",
      page: String(page),
    });

    const html = await requestText(buildListUrl(queryParams), context);
    const parsed = parseListingFromInertia(html);

    return {
      items: parsed.items,
      page,
      hasNextPage: parsed.hasNextPage,
    };
  },

  async getMangaDetails(mangaId, context) {
    const mangaUrl = resolveMangaUrl(mangaId);
    const html = await requestMangaText(mangaUrl, context);
    return parseMangaDetailsFromInertia(mangaUrl, html);
  },

  async getChapters(mangaId, context) {
    const mangaUrl = resolveMangaUrl(mangaId);
    const html = await requestMangaText(mangaUrl, context);
    return parseChaptersFromInertia(html);
  },

  async getChapterPages(chapterId, context) {
    const chapterUrl = resolveChapterUrl(chapterId);
    const html = await requestText(chapterUrl, context);
    return parseChapterPagesFromInertia(chapterUrl, html);
  },
};
