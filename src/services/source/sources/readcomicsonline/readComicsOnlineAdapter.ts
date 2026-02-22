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

const READ_COMICS_ONLINE_SOURCE_ID = "readcomicsonline";
const READ_COMICS_ONLINE_BASE_URL = "https://readcomicsonline.ru";
const ACCEPT_HTML_HEADER =
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const SEARCH_PAGE_SIZE = 24;

const DETAIL_TITLE_SELECTOR = ".listmanga-header, .widget-title";
const DETAIL_COVER_SELECTOR = ".row img.img-responsive";
const DETAIL_DESCRIPTION_SELECTOR = ".row .well";
const CHAPTER_LIST_SELECTOR = "ul.chapters > li:not(.btn)";
const CHAPTER_TITLE_SELECTOR = ".chapter-title-rtl a[href]";
const CHAPTER_DATE_SELECTOR = ".date-chapter-title-rtl";
const PAGE_IMAGE_SELECTOR = "#all > img.img-responsive";

const IMAGE_ATTRIBUTE_PRIORITY = [
  "data-src",
  "data-lazy-src",
  "data-cfsrc",
  "src",
] as const;

interface HtmlElement {
  querySelector: (selector: string) => HtmlElement | null;
  querySelectorAll: (selector: string) => Set<HtmlElement>;
  getAttribute: (attributeName: string) => string;
  textContent?: string;
}

interface SearchSuggestion {
  value?: string;
  data?: string;
}

interface SearchSuggestionsResponse {
  suggestions?: SearchSuggestion[];
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

const stripHtmlTags = (value: string): string =>
  cleanText(decodeHtmlEntities(value).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "));

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
    return `${READ_COMICS_ONLINE_BASE_URL}${value}`;
  }

  return `${READ_COMICS_ONLINE_BASE_URL}/${value}`;
};

const toPath = (pathOrUrl: string): string => {
  const value = cleanText(pathOrUrl);
  if (!value) {
    return "";
  }

  if (isAbsoluteHttpUrl(value)) {
    try {
      return new URL(value).pathname;
    } catch {
      return "";
    }
  }

  if (value.startsWith("/")) {
    return value;
  }

  return `/${value}`;
};

const slugFromMangaId = (mangaIdOrUrl: string): string => {
  const path = toPath(mangaIdOrUrl);
  const segments = path.split("/").filter(Boolean);

  if (segments.length >= 2 && segments[0] === "comic") {
    return segments[1] ?? "";
  }

  return segments[segments.length - 1] ?? cleanText(mangaIdOrUrl);
};

const mangaIdFromUrl = (mangaUrl: string): string => {
  const slug = slugFromMangaId(mangaUrl);
  return slug ? `/comic/${slug}` : "";
};

const normalizeChapterPath = (chapterIdOrUrl: string): string => {
  const path = toPath(chapterIdOrUrl);
  const segments = path.split("/").filter(Boolean);

  if (segments.length >= 3 && segments[0] === "comic") {
    return `/comic/${segments[1]}/${segments[2]}`;
  }

  if (segments.length >= 2 && segments[0] === "comic") {
    return `/comic/${segments[1]}/${segments[segments.length - 1]}`;
  }

  if (segments.length >= 2) {
    return `/comic/${segments[0]}/${segments[1]}`;
  }

  return "";
};

const resolveMangaUrl = (mangaIdOrUrl: string): string => {
  const slug = slugFromMangaId(mangaIdOrUrl);
  return slug ? `${READ_COMICS_ONLINE_BASE_URL}/comic/${slug}` : "";
};

const resolveChapterUrl = (chapterIdOrUrl: string): string => {
  const chapterPath = normalizeChapterPath(chapterIdOrUrl);
  return chapterPath ? `${READ_COMICS_ONLINE_BASE_URL}${chapterPath}` : "";
};

const guessCoverUrl = (mangaIdOrSlug: string, fallback: string): string => {
  const normalizedFallback = toAbsoluteUrl(fallback);
  if (normalizedFallback && !normalizedFallback.endsWith("no-image.png")) {
    return normalizedFallback;
  }

  const slug = slugFromMangaId(mangaIdOrSlug);
  if (!slug) {
    return normalizedFallback;
  }

  return `${READ_COMICS_ONLINE_BASE_URL}/uploads/manga/${slug}/cover/cover_250x350.jpg`;
};

const mapStatus = (value: string): SourceMangaDetails["status"] => {
  const normalized = toLower(value);

  if (normalized.includes("ongoing") || normalized.includes("on going")) {
    return "ongoing";
  }

  if (normalized.includes("hiatus")) {
    return "hiatus";
  }

  if (
    normalized.includes("complete") ||
    normalized.includes("completed") ||
    normalized.includes("finished")
  ) {
    return "completed";
  }

  if (normalized.includes("dropped") || normalized.includes("cancelled")) {
    return "cancelled";
  }

  return "unknown";
};

const parseChapterNumber = (title: string): number | undefined => {
  const match = cleanText(title).match(/([+-]?(?:\d*\.)?\d+)/);
  if (!match) {
    return undefined;
  }

  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseChapterDate = (rawDate: string): string | undefined => {
  const cleaned = cleanText(rawDate);
  if (!cleaned) {
    return undefined;
  }

  const normalized = cleaned.replace(/(\b[A-Za-z]{3})\./g, "$1");
  const timestamp = Date.parse(normalized);
  if (Number.isNaN(timestamp)) {
    return undefined;
  }

  return new Date(timestamp).toISOString().split("T")[0];
};

const cleanChapterName = (mangaTitle: string, chapterTitle: string): string => {
  const title = cleanText(chapterTitle);
  const baseTitle = cleanText(mangaTitle);

  const initialName = baseTitle
    ? title.replace(new RegExp(`^${baseTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), "")
    : title;

  const parts = initialName
    .split(":", 2)
    .map((entry) => cleanText(entry))
    .filter(Boolean);

  if (parts.length < 2 || parts[0] === parts[1]) {
    return parts[0] ?? title;
  }

  return `${parts[0]}: ${parts[1]}`;
};

const getNextPageFlag = (root: HtmlElement): boolean =>
  asArray(root.querySelectorAll(".pagination a[rel=next], .pagination li.next a[href]")).length > 0;

const parseMangaCards = (root: HtmlElement, selector: string): SourceManga[] => {
  const cards = asArray(root.querySelectorAll(selector));

  const mapped = cards
    .map((card): SourceManga | null => {
      const link =
        card.querySelector(".media-heading a[href]") ??
        card.querySelector(".manga-heading a[href]") ??
        card.querySelector("a[href]");

      const mangaUrl = toAbsoluteUrl(cleanText(link?.getAttribute("href")));
      const mangaId = mangaIdFromUrl(mangaUrl);
      const title = cleanText(link?.textContent);

      if (!mangaId || !mangaUrl || !title) {
        return null;
      }

      const image = card.querySelector("img");
      const cover = guessCoverUrl(mangaId, cleanText(image?.getAttribute("src")));

      return {
        id: mangaId,
        title,
        url: mangaUrl,
        thumbnailUrl: cover || undefined,
      };
    })
    .filter((entry): entry is SourceManga => Boolean(entry));

  const deduplicated = new Map<string, SourceManga>();
  mapped.forEach((entry) => {
    if (!deduplicated.has(entry.id)) {
      deduplicated.set(entry.id, entry);
    }
  });

  return Array.from(deduplicated.values());
};

const parseDefinitionFields = (html: string): Record<string, string> => {
  const listMatch = html.match(
    /<dl[^>]*class=["'][^"']*dl-horizontal[^"']*["'][^>]*>([\s\S]*?)<\/dl>/i
  );
  if (!listMatch || !listMatch[1]) {
    return {};
  }

  const fields: Record<string, string> = {};

  for (const match of listMatch[1].matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)) {
    const rawKey = stripHtmlTags(match[1] ?? "");
    const rawValue = stripHtmlTags(match[2] ?? "");
    const key = toLower(rawKey).replace(/:$/, "");
    if (key && rawValue) {
      fields[key] = rawValue;
    }
  }

  return fields;
};

const parseMangaDetails = (mangaUrl: string, html: string): SourceMangaDetails => {
  const root = parseHtmlRoot(html);
  const mangaId = mangaIdFromUrl(mangaUrl);
  const title = cleanText(root.querySelector(DETAIL_TITLE_SELECTOR)?.textContent);

  const cover = guessCoverUrl(
    mangaId,
    cleanText(root.querySelector(DETAIL_COVER_SELECTOR)?.getAttribute("src"))
  );

  const descriptionNode = root.querySelector(DETAIL_DESCRIPTION_SELECTOR);
  const description = cleanText(descriptionNode?.textContent);

  const fields = parseDefinitionFields(html);
  const genre = (fields["categories"] ?? fields["genre"] ?? "")
    .split(/[,/]+/)
    .map(cleanText)
    .filter(Boolean);

  const authors = (fields["author(s)"] ?? fields["author"] ?? "")
    .split(/[,/]+/)
    .map(cleanText)
    .filter(Boolean);

  const artists = (fields["artist(s)"] ?? fields["artist"] ?? "")
    .split(/[,/]+/)
    .map(cleanText)
    .filter(Boolean);

  const status = mapStatus(fields["status"] ?? "");

  return {
    id: mangaId,
    title,
    url: mangaUrl,
    thumbnailUrl: cover || undefined,
    description: description || undefined,
    genres: genre,
    authors,
    artists,
    status,
  };
};

const parseChapters = (mangaUrl: string, html: string): SourceChapter[] => {
  const root = parseHtmlRoot(html);
  const mangaTitle = cleanText(root.querySelector(DETAIL_TITLE_SELECTOR)?.textContent);

  const chapters = asArray(root.querySelectorAll(CHAPTER_LIST_SELECTOR))
    .map((entry): SourceChapter | null => {
      const chapterLink = entry.querySelector(CHAPTER_TITLE_SELECTOR);
      const chapterUrl = toAbsoluteUrl(cleanText(chapterLink?.getAttribute("href")));
      const chapterId = normalizeChapterPath(chapterUrl);
      const chapterLabel = cleanChapterName(mangaTitle, cleanText(chapterLink?.textContent));
      const rawDate = cleanText(entry.querySelector(CHAPTER_DATE_SELECTOR)?.textContent);

      if (!chapterId || !chapterUrl) {
        return null;
      }

      return {
        id: chapterId,
        title: chapterLabel || chapterId.split("/").filter(Boolean).pop() || "Chapter",
        url: chapterUrl,
        number: parseChapterNumber(chapterLabel),
        uploadedAt: parseChapterDate(rawDate),
      };
    })
    .filter((entry): entry is SourceChapter => Boolean(entry));

  return chapters;
};

const getImageUrl = (element: HtmlElement | null): string => {
  if (!element) {
    return "";
  }

  for (const attribute of IMAGE_ATTRIBUTE_PRIORITY) {
    const candidate = cleanText(element.getAttribute(attribute));
    if (!candidate || candidate.startsWith("data:image")) {
      continue;
    }

    return toAbsoluteUrl(candidate);
  }

  return "";
};

const parsePages = async (chapterUrl: string, html: string): Promise<SourcePage[]> => {
  const root = parseHtmlRoot(html);
  const pageImages = asArray(root.querySelectorAll(PAGE_IMAGE_SELECTOR));
  const cookieHeader = await getCookieHeaderForUrl(chapterUrl);

  return pageImages
    .map((image, index): SourcePage | null => {
      const imageUrl = getImageUrl(image);
      if (!imageUrl) {
        return null;
      }

      const headers: Record<string, string> = {
        Referer: `${READ_COMICS_ONLINE_BASE_URL}/`,
      };

      if (cookieHeader) {
        headers.Cookie = cookieHeader;
      }

      return {
        index,
        imageUrl,
        headers,
      };
    })
    .filter((entry): entry is SourcePage => Boolean(entry));
};

const requestText = async (url: string, context: SourceAdapterContext): Promise<string> => {
  const response = await context.http.get<string>(url, {
    responseType: "text",
    headers: {
      Accept: ACCEPT_HTML_HEADER,
      Referer: `${READ_COMICS_ONLINE_BASE_URL}/`,
    },
  });

  return typeof response.data === "string" ? response.data : String(response.data ?? "");
};

const requestSearchSuggestions = async (
  query: string,
  context: SourceAdapterContext
): Promise<SearchSuggestion[]> => {
  const response = await context.http.get<SearchSuggestionsResponse | string>(
    `${READ_COMICS_ONLINE_BASE_URL}/search?query=${encodeURIComponent(query)}`,
    {
      responseType: "json",
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        Referer: `${READ_COMICS_ONLINE_BASE_URL}/`,
      },
    }
  );

  const raw = response.data;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as SearchSuggestionsResponse;
      return parsed.suggestions ?? [];
    } catch {
      return [];
    }
  }

  return raw.suggestions ?? [];
};

const parseLatestOrPopular = (html: string, selector: string) => {
  const root = parseHtmlRoot(html);
  return {
    items: parseMangaCards(root, selector),
    hasNextPage: getNextPageFlag(root),
  };
};

const buildPopularUrl = (page: number): string =>
  `${READ_COMICS_ONLINE_BASE_URL}/filterList?page=${page}&sortBy=views&asc=false`;

const buildLatestUrl = (page: number): string =>
  `${READ_COMICS_ONLINE_BASE_URL}/latest-release?page=${page}`;

export const readComicsOnlineAdapter: SourceAdapter = {
  descriptor: {
    id: READ_COMICS_ONLINE_SOURCE_ID,
    name: "Read Comics Online",
    language: "en",
    baseUrl: READ_COMICS_ONLINE_BASE_URL,
    isNsfw: false,
    supportsSearch: true,
    supportsPopular: true,
    supportsLatest: true,
    supportsFilters: false,
  },

  async getPopularTitles(params, context) {
    const page = params.page ?? 1;
    const html = await requestText(buildPopularUrl(page), context);
    const parsed = parseLatestOrPopular(html, "div.media");

    return {
      items: parsed.items,
      page,
      hasNextPage: parsed.hasNextPage,
    };
  },

  async getLatestUpdates(params, context) {
    const page = params.page ?? 1;
    const html = await requestText(buildLatestUrl(page), context);
    const parsed = parseLatestOrPopular(html, "div.mangalist div.manga-item, div.media");

    return {
      items: parsed.items,
      page,
      hasNextPage: parsed.hasNextPage,
    };
  },

  async search(params, context) {
    const query = cleanText(params.query);
    const page = params.page ?? 1;

    if (!query) {
      return {
        items: [],
        page,
        hasNextPage: false,
      };
    }

    const suggestions = await requestSearchSuggestions(query, context);

    const allItems = suggestions
      .map((entry): SourceManga | null => {
        const slug = cleanText(entry.data);
        const title = stripHtmlTags(cleanText(entry.value));

        if (!slug || !title) {
          return null;
        }

        const id = `/comic/${slug}`;
        return {
          id,
          title,
          url: `${READ_COMICS_ONLINE_BASE_URL}${id}`,
          thumbnailUrl: guessCoverUrl(slug, "") || undefined,
        };
      })
      .filter((entry): entry is SourceManga => Boolean(entry));

    const deduplicated = new Map<string, SourceManga>();
    allItems.forEach((entry) => {
      if (!deduplicated.has(entry.id)) {
        deduplicated.set(entry.id, entry);
      }
    });

    const items = Array.from(deduplicated.values());
    const start = (page - 1) * SEARCH_PAGE_SIZE;
    const end = start + SEARCH_PAGE_SIZE;

    return {
      items: items.slice(start, end),
      page,
      hasNextPage: end < items.length,
    };
  },

  async getMangaDetails(mangaId, context) {
    const mangaUrl = resolveMangaUrl(mangaId);
    const html = await requestText(mangaUrl, context);
    return parseMangaDetails(mangaUrl, html);
  },

  async getChapters(mangaId, context) {
    const mangaUrl = resolveMangaUrl(mangaId);
    const html = await requestText(mangaUrl, context);
    return parseChapters(mangaUrl, html);
  },

  async getChapterPages(chapterId, context) {
    const chapterUrl = resolveChapterUrl(chapterId);
    const html = await requestText(chapterUrl, context);
    return parsePages(chapterUrl, html);
  },
};
