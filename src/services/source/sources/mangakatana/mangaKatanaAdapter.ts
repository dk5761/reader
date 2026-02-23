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

const MANGAKATANA_SOURCE_ID = "mangakatana";
const MANGAKATANA_BASE_URL = "https://mangakatana.com";
const ACCEPT_HTML_HEADER =
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const MANGA_REQUEST_CACHE_TTL_MS = 15000;

const selectors = {
  mangaItem: "div#book_list > div.item",
  mangaTitle: "div.text > h3 > a",
  mangaThumbnail: "img",
  detailAuthor: ".author",
  detailDescription: ".summary > p",
  detailAltName: ".alt_name",
  detailStatus: ".value.status",
  detailGenres: ".genres > a",
  detailThumbnail: "div.media div.cover img",
  chapterDate: ".update_time",
  nextPage: "a.next.page-numbers",
};

interface HtmlElement {
  querySelector: (selector: string) => HtmlElement | null;
  querySelectorAll: (selector: string) => Set<HtmlElement>;
  getAttribute: (attributeName: string) => string;
  textContent?: string;
}

const asArray = <T>(value: Set<T> | null | undefined): T[] => Array.from(value ?? []);

const cleanText = (value: string | null | undefined): string =>
  (value ?? "").replace(/\s+/g, " ").trim();

const toLower = (value: string | null | undefined): string => cleanText(value).toLowerCase();

const isAbsoluteHttpUrl = (value: string): boolean =>
  value.startsWith("http://") || value.startsWith("https://");

const parseHtmlRoot = (html: string): HtmlElement => {
  const parsedDocument = IDOMParser.parse(html, { onlyBody: true });
  return parsedDocument.documentElement as unknown as HtmlElement;
};

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
    return `${MANGAKATANA_BASE_URL}${value}`;
  }

  return `${MANGAKATANA_BASE_URL}/${value}`;
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

const toContentId = (pathOrUrl: string): string => {
  const absolute = toAbsoluteUrl(pathOrUrl);
  if (!absolute) {
    return "";
  }

  try {
    const parsed = new URL(absolute);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "";
  }
};

const parseStatus = (value: string): SourceMangaDetails["status"] => {
  const normalized = toLower(value);
  if (normalized.includes("completed")) {
    return "completed";
  }
  if (normalized.includes("ongoing")) {
    return "ongoing";
  }
  if (normalized.includes("hiatus")) {
    return "hiatus";
  }
  if (normalized.includes("cancelled") || normalized.includes("dropped")) {
    return "cancelled";
  }
  return "unknown";
};

const parseChapterNumber = (title: string): number | undefined => {
  const match = cleanText(title).match(/([+-]?(?:[0-9]*[.])?[0-9]+)/);
  if (!match) {
    return undefined;
  }

  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseMangaListFromHtml = (html: string): { items: SourceManga[]; hasNextPage: boolean } => {
  const root = parseHtmlRoot(html);
  const entries = asArray(root.querySelectorAll(selectors.mangaItem));

  const items = entries
    .map((entry): SourceManga | null => {
      const titleElement = entry.querySelector(selectors.mangaTitle);
      const imageElement = entry.querySelector(selectors.mangaThumbnail);

      const mangaUrl = toAbsoluteUrl(cleanText(titleElement?.getAttribute("href")));
      const title = cleanText(titleElement?.textContent);
      const cover = toAbsoluteUrl(cleanText(imageElement?.getAttribute("src")));
      const id = toContentId(mangaUrl);

      if (!id || !mangaUrl || !title) {
        return null;
      }

      return {
        id,
        title,
        url: mangaUrl,
        thumbnailUrl: cover || undefined,
      };
    })
    .filter((item): item is SourceManga => Boolean(item));

  const deduplicated = new Map<string, SourceManga>();
  items.forEach((item) => {
    if (!deduplicated.has(item.id)) {
      deduplicated.set(item.id, item);
    }
  });

  return {
    items: Array.from(deduplicated.values()),
    hasNextPage: root.querySelector(selectors.nextPage) !== null,
  };
};

const parseSingleSearchResult = (html: string): SourceManga[] => {
  const root = parseHtmlRoot(html);
  const title = cleanText(root.querySelector("h1.heading")?.textContent);
  const cover = toAbsoluteUrl(cleanText(root.querySelector(selectors.detailThumbnail)?.getAttribute("src")));

  const urlMeta = root.querySelector('meta[property="og:url"]');
  const mangaUrl = toAbsoluteUrl(cleanText(urlMeta?.getAttribute("content")));
  const id = toContentId(mangaUrl);

  if (!title || !mangaUrl || !id) {
    return [];
  }

  return [
    {
      id,
      title,
      url: mangaUrl,
      thumbnailUrl: cover || undefined,
    },
  ];
};

const parseMangaDetails = (mangaUrl: string, html: string): SourceMangaDetails => {
  const root = parseHtmlRoot(html);
  const title = cleanText(root.querySelector("h1.heading")?.textContent);
  const cover = toAbsoluteUrl(cleanText(root.querySelector(selectors.detailThumbnail)?.getAttribute("src")));

  const author = asArray(root.querySelectorAll(selectors.detailAuthor))
    .map((entry) => cleanText(entry.textContent))
    .filter(Boolean);

  let description = cleanText(root.querySelector(selectors.detailDescription)?.textContent);
  const altName = cleanText(root.querySelector(selectors.detailAltName)?.textContent);
  if (altName) {
    description += `${description ? "\n\n" : ""}Alt name(s): ${altName}`;
  }

  const genres = asArray(root.querySelectorAll(selectors.detailGenres))
    .map((entry) => cleanText(entry.textContent))
    .filter(Boolean);

  const status = parseStatus(cleanText(root.querySelector(selectors.detailStatus)?.textContent));
  const id = toContentId(mangaUrl);

  return {
    id,
    title,
    url: mangaUrl,
    thumbnailUrl: cover || undefined,
    description: description || undefined,
    authors: author,
    status,
    genres,
  };
};

const parseChapters = (mangaId: string, mangaUrl: string, html: string): SourceChapter[] => {
  const root = parseHtmlRoot(html);
  const chapterRows = asArray(root.querySelectorAll("tr"));

  const chapters = chapterRows
    .filter((row) => row.querySelector(".chapter"))
    .map((row): SourceChapter | null => {
      const linkElement = row.querySelector("a[href]");
      const chapterUrl = toAbsoluteUrl(cleanText(linkElement?.getAttribute("href")));
      const chapterTitle = cleanText(linkElement?.textContent);
      const dateText = cleanText(row.querySelector(selectors.chapterDate)?.textContent);
      const id = toContentId(chapterUrl);

      if (!id || !chapterUrl) {
        return null;
      }

      return {
        id,
        title: chapterTitle || `Chapter ${id.split("/").filter(Boolean).pop() ?? ""}`,
        url: chapterUrl,
        number: parseChapterNumber(chapterTitle),
        uploadedAt: dateText || undefined,
      };
    })
    .filter((chapter): chapter is SourceChapter => Boolean(chapter));

  const deduplicated = new Map<string, SourceChapter>();
  chapters.forEach((chapter) => {
    if (!deduplicated.has(chapter.id)) {
      deduplicated.set(chapter.id, chapter);
    }
  });

  const deduped = Array.from(deduplicated.values());
  if (deduped.length > 0) {
    return deduped;
  }

  // Fallback selector for layouts where chapter rows are not table-based.
  return asArray(root.querySelectorAll("a.chapter"))
    .map((entry): SourceChapter | null => {
      const chapterUrl = toAbsoluteUrl(cleanText(entry.getAttribute("href")));
      const chapterTitle = cleanText(entry.textContent);
      const id = toContentId(chapterUrl);
      if (!id || !chapterUrl) {
        return null;
      }
      return {
        id,
        title: chapterTitle || `Chapter ${id.split("/").filter(Boolean).pop() ?? ""}`,
        url: chapterUrl,
        number: parseChapterNumber(chapterTitle),
      };
    })
    .filter((chapter): chapter is SourceChapter => Boolean(chapter));
};

const parseChapterPages = async (
  chapterUrl: string,
  html: string
): Promise<SourcePage[]> => {
  const arrayNameMatch = html.match(/data-src['"]\s*,\s*(\w+)/);
  if (!arrayNameMatch) {
    return [];
  }

  const arrayName = arrayNameMatch[1];
  const arrayRegex = new RegExp(`var\\s+${arrayName}\\s*=\\s*\\[([^\\]]*)\\]`);
  const arrayMatch = html.match(arrayRegex);
  if (!arrayMatch) {
    return [];
  }

  const urlMatches = arrayMatch[1].match(/'([^']+)'/g);
  if (!urlMatches) {
    return [];
  }

  // Try to extract chapter title from page title
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  let chapterTitle: string | undefined;
  let chapterNumber: number | undefined;

  if (titleMatch) {
    chapterTitle = cleanText(titleMatch[1]);
    // Extract chapter number from title (e.g., "Chapter 123" or "123")
    const numMatch = chapterTitle.match(/(?:chapter\s*)?([+-]?(?:\d*\.)?\d+)/i);
    if (numMatch) {
      chapterNumber = parseFloat(numMatch[1]);
    }
  }

  const cookieHeader = await getCookieHeaderForUrl(chapterUrl);

  return urlMatches
    .map((rawUrl, index): SourcePage | null => {
      const imageUrl = toAbsoluteUrl(rawUrl.replace(/'/g, ""));
      if (!imageUrl) {
        return null;
      }

      const headers: Record<string, string> = {
        Referer: `${MANGAKATANA_BASE_URL}/`,
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
    })
    .filter((page): page is SourcePage => Boolean(page));
};

const requestText = async (url: string, context: SourceAdapterContext): Promise<string> => {
  const response = await context.http.get<string>(url, {
    responseType: "text",
    headers: {
      Accept: ACCEPT_HTML_HEADER,
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

const buildLatestUrl = (page: number): string => `${MANGAKATANA_BASE_URL}/page/${page}`;
const buildPopularUrl = (page: number): string => `${MANGAKATANA_BASE_URL}/manga/page/${page}`;
const buildSearchUrl = (query: string, page: number): string =>
  `${MANGAKATANA_BASE_URL}/page/${page}?search=${encodeURIComponent(
    query
  )}&search_by=book_name`;

const resolveMangaUrl = (mangaIdOrUrl: string): string =>
  toAbsoluteUrl(toPathWithQuery(mangaIdOrUrl));

const resolveChapterUrl = (chapterIdOrUrl: string): string =>
  toAbsoluteUrl(toPathWithQuery(chapterIdOrUrl));

export const mangaKatanaAdapter: SourceAdapter = {
  descriptor: {
    id: MANGAKATANA_SOURCE_ID,
    name: "MangaKatana",
    language: "en",
    baseUrl: MANGAKATANA_BASE_URL,
    isNsfw: false,
    supportsSearch: true,
    supportsPopular: true,
    supportsLatest: true,
    supportsFilters: false,
  },

  async getLatestUpdates(params, context) {
    const page = params.page ?? 1;
    const html = await requestText(buildLatestUrl(page), context);
    const parsed = parseMangaListFromHtml(html);

    return {
      items: parsed.items,
      page,
      hasNextPage: parsed.hasNextPage,
    };
  },

  async getPopularTitles(params, context) {
    const page = params.page ?? 1;
    const html = await requestText(buildPopularUrl(page), context);
    const parsed = parseMangaListFromHtml(html);

    return {
      items: parsed.items,
      page,
      hasNextPage: parsed.hasNextPage,
    };
  },

  async search(params, context) {
    const page = params.page ?? 1;
    const query = cleanText(params.query);
    const html = await requestText(buildSearchUrl(query, page), context);

    if (html.includes('class="heading"') && html.includes("div.media")) {
      const items = parseSingleSearchResult(html);
      return {
        items,
        page,
        hasNextPage: false,
      };
    }

    const parsed = parseMangaListFromHtml(html);
    return {
      items: parsed.items,
      page,
      hasNextPage: parsed.hasNextPage,
    };
  },

  async getMangaDetails(mangaId, context) {
    const mangaUrl = resolveMangaUrl(mangaId);
    const html = await requestMangaText(mangaUrl, context);
    return parseMangaDetails(mangaUrl, html);
  },

  async getChapters(mangaId, context) {
    const mangaUrl = resolveMangaUrl(mangaId);
    const html = await requestMangaText(mangaUrl, context);
    return parseChapters(mangaId, mangaUrl, html);
  },

  async getChapterPages(chapterId, context) {
    const chapterUrl = resolveChapterUrl(chapterId);
    const html = await requestText(chapterUrl, context);
    return parseChapterPages(chapterUrl, html);
  },
};
