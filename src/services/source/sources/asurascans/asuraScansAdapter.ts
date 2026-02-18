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

const ASURA_SOURCE_ID = "asurascans";
const ASURA_BASE_URL = "https://asuracomic.net";

const LISTING_CARD_SELECTOR = "div.grid.grid-cols-2 > a[href], div.grid > a[href]";
const LISTING_TITLE_SELECTOR = "span.block.font-bold";
const LISTING_IMAGE_SELECTOR = "img";
const DETAIL_TITLE_SELECTOR = "div.text-center.sm\\:text-left span.text-xl.font-bold";
const DETAIL_THUMBNAIL_SELECTOR = "img[alt=poster]";
const DETAIL_DESCRIPTION_SELECTOR = "span.font-medium.text-sm";
const DETAIL_INFO_GRID_SELECTOR = "div.grid > div";
const DETAIL_INFO_FLEX_SELECTOR = "div.flex";
const DETAIL_GENRES_SELECTOR = "div.flex.flex-row.flex-wrap.gap-3 button";
const CHAPTER_LIST_SELECTOR = "div.scrollbar-thumb-themecolor > div.group";

const IGNORED_PATH_PREFIXES = ["/api", "/_next", "/storage"];
const IMAGE_ATTRIBUTES = ["data-src", "src", "data-lazy-src"];

interface HtmlElement {
  querySelector: (selector: string) => HtmlElement | null;
  querySelectorAll: (selector: string) => Set<HtmlElement>;
  getAttribute: (attrName: string) => string;
  textContent?: string;
}

interface ParsedImagePage {
  order: number;
  url: string;
}

const asArray = <T>(value: Set<T> | null | undefined): T[] => Array.from(value ?? []);

const cleanText = (value: string | null | undefined): string =>
  (value ?? "").replace(/\s+/g, " ").trim();

const toLower = (value: string | null | undefined): string => cleanText(value).toLowerCase();

const isAbsoluteHttpUrl = (value: string): boolean =>
  value.startsWith("http://") || value.startsWith("https://");

const isIgnoredPath = (path: string): boolean =>
  IGNORED_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

const normalizeContentPath = (pathOrUrl: string): string => {
  const value = cleanText(pathOrUrl);
  if (!value) {
    return "";
  }

  let pathWithQuery = value;
  if (isAbsoluteHttpUrl(value)) {
    const parsed = new URL(value);
    pathWithQuery = `${parsed.pathname}${parsed.search}`;
  }

  if (pathWithQuery.startsWith("//")) {
    return normalizeContentPath(`https:${pathWithQuery}`);
  }

  const normalized = pathWithQuery.startsWith("/")
    ? pathWithQuery
    : `/${pathWithQuery.replace(/^\/+/, "")}`;

  if (normalized.startsWith("/series/") || isIgnoredPath(normalized)) {
    return normalized;
  }

  return `/series${normalized}`;
};

const toAbsoluteUrl = (pathOrUrl: string, normalizeAsContentPath: boolean): string => {
  const value = cleanText(pathOrUrl);
  if (!value) {
    return "";
  }

  if (value.startsWith("//")) {
    return `https:${value}`;
  }

  if (isAbsoluteHttpUrl(value)) {
    if (!normalizeAsContentPath) {
      return value;
    }

    const parsed = new URL(value);
    if (parsed.hostname !== new URL(ASURA_BASE_URL).hostname) {
      return value;
    }

    return `${ASURA_BASE_URL}${normalizeContentPath(`${parsed.pathname}${parsed.search}`)}`;
  }

  if (!normalizeAsContentPath) {
    if (value.startsWith("/")) {
      return `${ASURA_BASE_URL}${value}`;
    }

    return `${ASURA_BASE_URL}/${value}`;
  }

  return `${ASURA_BASE_URL}${normalizeContentPath(value)}`;
};

const toContentId = (pathOrUrl: string): string => {
  const normalized = normalizeContentPath(pathOrUrl);
  if (!normalized) {
    return "";
  }

  const parsed = new URL(`${ASURA_BASE_URL}${normalized}`);
  return parsed.pathname;
};

const resolveMangaUrl = (mangaIdOrUrl: string): string => toAbsoluteUrl(mangaIdOrUrl, true);

const resolveChapterUrl = (chapterIdOrUrl: string): string => toAbsoluteUrl(chapterIdOrUrl, true);

const getImageUrl = (element: HtmlElement | null): string => {
  if (!element) {
    return "";
  }

  for (const attribute of IMAGE_ATTRIBUTES) {
    const value = cleanText(element.getAttribute(attribute));
    if (!value || value.startsWith("data:image")) {
      continue;
    }

    return toAbsoluteUrl(value, false);
  }

  return "";
};

const parseHtmlRoot = (html: string): HtmlElement => {
  const parsedDocument = IDOMParser.parse(html, { onlyBody: true });
  return parsedDocument.documentElement as unknown as HtmlElement;
};

const hasNextPageLink = (root: HtmlElement): boolean =>
  asArray(root.querySelectorAll("a[href]")).some((anchor) => {
    const text = toLower(anchor.textContent);
    if (text === "next" || text.startsWith("next ")) {
      return true;
    }

    const rel = toLower(anchor.getAttribute("rel"));
    const ariaLabel = toLower(anchor.getAttribute("aria-label"));
    return rel === "next" || ariaLabel.includes("next");
  });

const parseStatus = (
  statusValue: string
): SourceMangaDetails["status"] => {
  const normalized = toLower(statusValue);

  if (normalized.includes("ongoing") || normalized.includes("season end")) {
    return "ongoing";
  }

  if (normalized.includes("hiatus")) {
    return "hiatus";
  }

  if (normalized.includes("completed")) {
    return "completed";
  }

  if (normalized.includes("cancelled") || normalized.includes("dropped")) {
    return "cancelled";
  }

  return "unknown";
};

const parseChapterNumber = (title: string): number | undefined => {
  const match = cleanText(title).match(/(\d+(?:\.\d+)?)/);
  if (!match) {
    return undefined;
  }

  const parsedNumber = Number.parseFloat(match[1]);
  return Number.isFinite(parsedNumber) ? parsedNumber : undefined;
};

const parseChapterDate = (rawValue: string): string | undefined => {
  const cleaned = cleanText(rawValue);
  if (!cleaned) {
    return undefined;
  }

  const withoutOrdinalSuffix = cleaned.replace(/(\d+)(st|nd|rd|th)\b/gi, "$1");
  const timestamp = Date.parse(withoutOrdinalSuffix);
  if (Number.isNaN(timestamp)) {
    return cleaned;
  }

  return new Date(timestamp).toISOString().split("T")[0];
};

const extractNextPayload = (chapterHtml: string): string => {
  const scriptMatches = chapterHtml.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\);?/g);
  const chunks: string[] = [];

  for (const match of scriptMatches) {
    const payload = match[1];
    if (!payload) {
      continue;
    }

    try {
      const parsed = JSON.parse(payload);
      if (Array.isArray(parsed) && typeof parsed[1] === "string") {
        chunks.push(parsed[1]);
      }
    } catch {
      // Ignore malformed chunks and keep parsing.
    }
  }

  return chunks.join("");
};

const extractPagesPayload = (payload: string): ParsedImagePage[] => {
  const escapedMatch = /\\"pages\\":\s*(\[[\s\S]*?\])/s.exec(payload);
  const plainMatch = /"pages":\s*(\[[\s\S]*?\])/s.exec(payload);

  if (!escapedMatch && !plainMatch) {
    return [];
  }

  const source = escapedMatch ? escapedMatch[1].replace(/\\(.)/g, "$1") : plainMatch![1];

  try {
    const parsed = JSON.parse(source) as ParsedImagePage[];
    return parsed
      .filter((entry) => Number.isFinite(entry.order) && Boolean(cleanText(entry.url)))
      .sort((first, second) => first.order - second.order);
  } catch {
    return [];
  }
};

const parseListing = (html: string): { items: SourceManga[]; hasNextPage: boolean } => {
  const root = parseHtmlRoot(html);
  const entries = asArray(root.querySelectorAll(LISTING_CARD_SELECTOR));

  const items = entries
    .map((entry): SourceManga | null => {
      const href = cleanText(entry.getAttribute("href"));
      const url = toAbsoluteUrl(href, true);
      if (!url) {
        return null;
      }

      const titleElement = entry.querySelector(LISTING_TITLE_SELECTOR);
      const imageElement = entry.querySelector(LISTING_IMAGE_SELECTOR);
      const title = cleanText(titleElement?.textContent);

      if (!title) {
        return null;
      }

      return {
        id: toContentId(url),
        title,
        url,
        thumbnailUrl: getImageUrl(imageElement),
      };
    })
    .filter((item): item is SourceManga => Boolean(item && item.id));

  return {
    items,
    hasNextPage: hasNextPageLink(root),
  };
};

const parseMangaDetails = (mangaUrl: string, html: string): SourceMangaDetails => {
  const root = parseHtmlRoot(html);
  const title = cleanText(root.querySelector(DETAIL_TITLE_SELECTOR)?.textContent);
  const cover = getImageUrl(root.querySelector(DETAIL_THUMBNAIL_SELECTOR));
  const description = cleanText(root.querySelector(DETAIL_DESCRIPTION_SELECTOR)?.textContent);

  const authors = new Set<string>();
  const artists = new Set<string>();
  const genres = new Set<string>();
  let statusLabel = "";

  const metadataNodes = [
    ...asArray(root.querySelectorAll(DETAIL_INFO_GRID_SELECTOR)),
    ...asArray(root.querySelectorAll(DETAIL_INFO_FLEX_SELECTOR)),
  ];

  metadataNodes.forEach((node) => {
    const headingNodes = asArray(node.querySelectorAll("h3"));
    if (headingNodes.length < 2) {
      return;
    }

    const label = toLower(headingNodes[0].textContent);
    const value = cleanText(headingNodes[1].textContent);
    if (!value) {
      return;
    }

    if (label.includes("author")) {
      authors.add(value);
      return;
    }

    if (label.includes("artist")) {
      artists.add(value);
      return;
    }

    if (label.includes("type")) {
      genres.add(value);
      return;
    }

    if (label.includes("status")) {
      statusLabel = value;
    }
  });

  asArray(root.querySelectorAll(DETAIL_GENRES_SELECTOR)).forEach((genreNode) => {
    const genre = cleanText(genreNode.textContent);
    if (genre) {
      genres.add(genre);
    }
  });

  const mangaId = toContentId(mangaUrl);

  return {
    id: mangaId,
    title,
    url: mangaUrl,
    thumbnailUrl: cover || undefined,
    description: description || undefined,
    authors: Array.from(authors),
    artists: Array.from(artists),
    genres: Array.from(genres),
    status: parseStatus(statusLabel),
  };
};

const parseChapters = (html: string): SourceChapter[] => {
  const root = parseHtmlRoot(html);
  const chapterRows = asArray(root.querySelectorAll(CHAPTER_LIST_SELECTOR));

  const parsedChapters = chapterRows
    .filter((row) => !row.querySelector("svg"))
    .map((row): SourceChapter | null => {
      const chapterAnchor = row.querySelector("a[href]");
      const rawUrl = cleanText(chapterAnchor?.getAttribute("href"));
      const chapterUrl = toAbsoluteUrl(rawUrl, true);
      if (!chapterUrl) {
        return null;
      }

      const chapterNumberText = cleanText(row.querySelector("h3")?.textContent);
      const chapterTitleText = asArray(row.querySelectorAll("h3 > span"))
        .map((span) => cleanText(span.textContent))
        .filter(Boolean)
        .join(" ");
      const chapterDateText = cleanText(row.querySelector("h3 + h3")?.textContent);

      const title = chapterTitleText
        ? `${chapterNumberText} - ${chapterTitleText}`
        : chapterNumberText || `Chapter ${toContentId(chapterUrl).split("/").pop() ?? ""}`;

      return {
        id: toContentId(chapterUrl),
        title,
        url: chapterUrl,
        number: parseChapterNumber(chapterNumberText),
        uploadedAt: parseChapterDate(chapterDateText),
        scanlator: undefined,
      };
    })
    .filter((chapter): chapter is SourceChapter =>
      Boolean(chapter && chapter.id && chapter.url && chapter.title)
    );

  // Some page layouts can render duplicate chapter rows; keep first occurrence by id.
  const uniqueChapterById = new Map<string, SourceChapter>();
  parsedChapters.forEach((chapter) => {
    if (!uniqueChapterById.has(chapter.id)) {
      uniqueChapterById.set(chapter.id, chapter);
    }
  });

  return Array.from(uniqueChapterById.values());
};

const parseChapterPages = async (
  chapterUrl: string,
  html: string
): Promise<SourcePage[]> => {
  const payload = extractNextPayload(html);
  const pages = extractPagesPayload(payload);

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

  if (!pages.length) {
    return [];
  }

  const cookieHeader = await getCookieHeaderForUrl(chapterUrl);

  return pages.map((page, index) => {
    const headers: Record<string, string> = {
      Referer: `${ASURA_BASE_URL}/`,
    };

    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    return {
      index,
      imageUrl: toAbsoluteUrl(page.url, false),
      headers,
      chapterTitle,
      chapterNumber,
    };
  });
};

const buildSeriesUrl = (params: URLSearchParams): string =>
  `${ASURA_BASE_URL}/series?${params.toString()}`;

const requestText = async (url: string, context: SourceAdapterContext): Promise<string> => {
  const response = await context.http.get<string>(url, {
    responseType: "text",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  return typeof response.data === "string" ? response.data : String(response.data ?? "");
};

export const asuraScansAdapter: SourceAdapter = {
  descriptor: {
    id: ASURA_SOURCE_ID,
    name: "Asura Scans",
    language: "en",
    baseUrl: ASURA_BASE_URL,
    supportsSearch: true,
    supportsPopular: true,
    supportsLatest: true,
    supportsFilters: false,
  },

  async search(params, context) {
    const page = params.page ?? 1;
    const query = cleanText(params.query);
    const queryParams = new URLSearchParams({
      name: query,
      genres: "",
      status: "-1",
      types: "-1",
      order: "rating",
      page: String(page),
    });

    const html = await requestText(buildSeriesUrl(queryParams), context);
    const parsed = parseListing(html);

    return {
      items: parsed.items,
      page,
      hasNextPage: parsed.hasNextPage,
    };
  },

  async getPopularTitles(params, context) {
    const page = params.page ?? 1;
    const queryParams = new URLSearchParams({
      genres: "",
      status: "-1",
      types: "-1",
      order: "rating",
      page: String(page),
    });

    const html = await requestText(buildSeriesUrl(queryParams), context);
    const parsed = parseListing(html);

    return {
      items: parsed.items,
      page,
      hasNextPage: parsed.hasNextPage,
    };
  },

  async getLatestUpdates(params, context) {
    const page = params.page ?? 1;
    const queryParams = new URLSearchParams({
      genres: "",
      status: "-1",
      types: "-1",
      order: "update",
      page: String(page),
    });

    const html = await requestText(buildSeriesUrl(queryParams), context);
    const parsed = parseListing(html);

    return {
      items: parsed.items,
      page,
      hasNextPage: parsed.hasNextPage,
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
    return parseChapters(html);
  },

  async getChapterPages(chapterId, context) {
    const chapterUrl = resolveChapterUrl(chapterId);
    const html = await requestText(chapterUrl, context);
    return parseChapterPages(chapterUrl, html);
  },
};
