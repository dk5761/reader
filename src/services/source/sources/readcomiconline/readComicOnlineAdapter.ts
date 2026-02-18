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

const READ_COMIC_ONLINE_SOURCE_ID = "readcomiconline";
const READ_COMIC_ONLINE_BASE_URL = "https://readcomiconline.li";
const ACCEPT_HTML_HEADER =
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

const LIST_ITEM_SELECTOR = ".item-list .section.group.list";
const CHAPTER_ROW_SELECTOR = "ul.list > li";
const NEXT_PAGE_SELECTOR = "a.next_bt";

const SOURCE_PREFERENCES: { quality: "hq" | "lq"; server: "" | "s2" } = {
  quality: "hq",
  server: "",
};

const USER_AGENT_HEADER =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

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
    return `${READ_COMIC_ONLINE_BASE_URL}${value}`;
  }

  return `${READ_COMIC_ONLINE_BASE_URL}/${value}`;
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
  if (normalized.includes("ongoing")) {
    return "ongoing";
  }

  if (normalized.includes("completed")) {
    return "completed";
  }

  if (normalized.includes("hiatus") || normalized.includes("on hold")) {
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

const dedupeById = <T extends { id: string }>(items: T[]): T[] => {
  const deduped = new Map<string, T>();
  items.forEach((item) => {
    if (!item.id || deduped.has(item.id)) {
      return;
    }

    deduped.set(item.id, item);
  });

  return Array.from(deduped.values());
};

const parseListing = (html: string): { items: SourceManga[]; hasNextPage: boolean } => {
  const root = parseHtmlRoot(html);
  const entries = asArray(root.querySelectorAll(LIST_ITEM_SELECTOR));

  const items = entries
    .map((entry): SourceManga | null => {
      const infoLink = entry.querySelector(".col.info p a") ?? entry.querySelector("a[href]");
      const title = cleanText(infoLink?.textContent);
      const mangaUrl = toAbsoluteUrl(cleanText(infoLink?.getAttribute("href")));
      const mangaId = toContentId(mangaUrl);

      const coverImage =
        entry.querySelector(".col.cover a img") ?? entry.querySelector(".col.cover img");
      const cover = toAbsoluteUrl(cleanText(coverImage?.getAttribute("src")));

      if (!title || !mangaUrl || !mangaId) {
        return null;
      }

      return {
        id: mangaId,
        title,
        url: mangaUrl,
        thumbnailUrl: cover || undefined,
      };
    })
    .filter((item): item is SourceManga => Boolean(item));

  return {
    items: dedupeById(items),
    hasNextPage: root.querySelector(NEXT_PAGE_SELECTOR) !== null,
  };
};

const extractInfoValueByLabel = (paragraphs: HtmlElement[], label: string): string | undefined => {
  const normalizedLabel = toLower(label);

  for (const paragraph of paragraphs) {
    const text = cleanText(paragraph.textContent);
    if (!toLower(text).includes(normalizedLabel)) {
      continue;
    }

    const linkedValues = asArray(paragraph.querySelectorAll("a"))
      .map((entry) => cleanText(entry.textContent))
      .filter(Boolean);

    if (linkedValues.length > 0) {
      return linkedValues.join(", ");
    }

    const colonIndex = text.indexOf(":");
    if (colonIndex >= 0) {
      return cleanText(text.slice(colonIndex + 1)) || undefined;
    }

    return text || undefined;
  }

  return undefined;
};

const extractGenres = (paragraphs: HtmlElement[]): string[] => {
  for (const paragraph of paragraphs) {
    const text = cleanText(paragraph.textContent);
    if (!toLower(text).includes("genres")) {
      continue;
    }

    const genres = asArray(paragraph.querySelectorAll("a"))
      .map((entry) => cleanText(entry.textContent))
      .filter(Boolean);

    if (genres.length > 0) {
      return genres;
    }

    const colonIndex = text.indexOf(":");
    if (colonIndex < 0) {
      return [];
    }

    return text
      .slice(colonIndex + 1)
      .split(",")
      .map(cleanText)
      .filter(Boolean);
  }

  return [];
};

const parseMangaDetails = (mangaUrl: string, html: string): SourceMangaDetails => {
  const root = parseHtmlRoot(html);
  const title =
    cleanText(root.querySelector(".content_top .heading h3")?.textContent) ||
    cleanText(root.querySelector("h1")?.textContent);

  const cover = toAbsoluteUrl(cleanText(root.querySelector(".col.cover img")?.getAttribute("src")));

  const infoParagraphs = asArray(root.querySelectorAll(".col.info p"));
  const author = extractInfoValueByLabel(infoParagraphs, "writer");
  const artist = extractInfoValueByLabel(infoParagraphs, "artist");
  const statusValue = extractInfoValueByLabel(infoParagraphs, "status") ?? "";
  const genres = extractGenres(infoParagraphs);

  const descriptionCandidates = asArray(root.querySelectorAll(".section.group p"))
    .map((entry) => cleanText(entry.textContent))
    .filter(Boolean);

  const description =
    descriptionCandidates.find((entry) => !entry.includes(":") && entry.length > 50) ||
    descriptionCandidates[0] ||
    undefined;

  return {
    id: toContentId(mangaUrl),
    title,
    url: mangaUrl,
    thumbnailUrl: cover || undefined,
    description,
    authors: author ? [author] : [],
    artists: artist ? [artist] : [],
    genres,
    status: parseStatus(statusValue),
  };
};

const parseChapters = (html: string): SourceChapter[] => {
  const root = parseHtmlRoot(html);
  const chapterRows = asArray(root.querySelectorAll(CHAPTER_ROW_SELECTOR));

  const chapters = chapterRows
    .map((row): SourceChapter | null => {
      const linkElement = row.querySelector(".col-1 a") ?? row.querySelector("a[href]");
      const chapterUrl = toAbsoluteUrl(cleanText(linkElement?.getAttribute("href")));
      const chapterId = toContentId(chapterUrl);
      const titleFromSpan = cleanText(linkElement?.querySelector("span")?.textContent);
      const chapterTitle = titleFromSpan || cleanText(linkElement?.textContent);
      const chapterDate = cleanText(row.querySelector(".col-2 span")?.textContent);

      if (!chapterUrl || !chapterId) {
        return null;
      }

      return {
        id: chapterId,
        title: chapterTitle || `Chapter ${chapterId.split("/").filter(Boolean).pop() ?? ""}`,
        url: chapterUrl,
        number: parseChapterNumber(chapterTitle),
        uploadedAt: chapterDate || undefined,
      };
    })
    .filter((chapter): chapter is SourceChapter => Boolean(chapter));

  const deduped = dedupeById(chapters);
  if (deduped.length > 0) {
    return deduped;
  }

  return asArray(root.querySelectorAll("a[href*='/Comic/']"))
    .map((entry): SourceChapter | null => {
      const chapterUrl = toAbsoluteUrl(cleanText(entry.getAttribute("href")));
      const chapterId = toContentId(chapterUrl);
      const chapterTitle = cleanText(entry.textContent);
      if (!chapterUrl || !chapterId) {
        return null;
      }

      return {
        id: chapterId,
        title: chapterTitle || `Chapter ${chapterId.split("/").filter(Boolean).pop() ?? ""}`,
        url: chapterUrl,
        number: parseChapterNumber(chapterTitle),
      };
    })
    .filter((chapter): chapter is SourceChapter => Boolean(chapter));
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const decodeBase64Binary = (value: string): string => {
  if (typeof globalThis.atob === "function") {
    return globalThis.atob(value);
  }

  throw new Error("atob is not available in this runtime.");
};

// The site's reader script decodes with decodeURIComponent(escape(atob(...))).
// This reproduces that behavior without relying on deprecated global escape().
const decodeBase64Utf8 = (value: string): string => {
  const binary = decodeBase64Binary(value);
  let percentEncoded = "";

  for (let index = 0; index < binary.length; index += 1) {
    const hex = binary.charCodeAt(index).toString(16).padStart(2, "0");
    percentEncoded += `%${hex}`;
  }

  return decodeURIComponent(percentEncoded);
};

const decodeImageUrl = (rawPath: string): string | null => {
  try {
    let value = rawPath;

    // Current site scripts replace this token with "e" before decode.
    value = value.replace(/RN__tgVzmZ_/g, "e");

    // Legacy token replacements kept as fallback across mirror/script variants.
    value = value.replace(/\w{5}__\w{3}__/g, "g");
    value = value.replace(/\w{2}__\w{6}_/g, "a");

    value = value.replace(/b/g, "pw_.g28x");
    value = value.replace(/h/g, "d2pr.x_27");
    value = value.replace(/pw_.g28x/g, "b");
    value = value.replace(/d2pr.x_27/g, "h");

    if (value.startsWith("https")) {
      return value;
    }

    const queryIndex = value.indexOf("?");
    if (queryIndex < 0) {
      return null;
    }

    const queryString = value.substring(queryIndex);
    const isLowQuality = value.includes("=s0?");
    const sizeMarker = isLowQuality ? "=s0?" : "=s1600?";
    const sizeIndex = value.indexOf(sizeMarker);
    if (sizeIndex < 0) {
      return null;
    }

    let transformed = value.substring(0, sizeIndex);
    if (transformed.length < 50) {
      return null;
    }

    transformed = transformed.substring(15, 33) + transformed.substring(50);

    if (transformed.length < 2) {
      return null;
    }

    const trimmedLength = Math.max(transformed.length - 11, 0);
    transformed = transformed.substring(0, trimmedLength) + transformed.slice(-2);

    const decoded = decodeBase64Utf8(transformed);
    if (decoded.length < 17) {
      return null;
    }

    let path = decoded.substring(0, 13) + decoded.substring(17);
    if (path.length < 2) {
      return null;
    }

    path = `${path.substring(0, path.length - 2)}${isLowQuality ? "=s0" : "=s1600"}`;

    return `https://2.bp.blogspot.com/${path}${queryString}`;
  } catch {
    return null;
  }
};

const decryptPageUrls = (html: string): string[] => {
  const urls: string[] = [];

  const variableMatch = html.match(/var\s+(_[^\s=]+mvn)\s*(?:=\s*[^;]+)?\s*;/);
  if (variableMatch) {
    const arrayPrefix = variableMatch[1].substring(0, 8);
    const pushPattern = new RegExp(
      `\\b${escapeRegExp(arrayPrefix)}\\s*\\.push\\(\\s*['\"]([^'\"]+)['\"]\\s*\\)`,
      "g"
    );

    for (const match of html.matchAll(pushPattern)) {
      const encodedUrl = match[1];
      if (!encodedUrl) {
        continue;
      }

      const decoded = decodeImageUrl(encodedUrl);
      if (decoded) {
        urls.push(decoded);
      }
    }
  } else {
    const fallbackPattern = /pth\s*=\s*'([^']+\?rhlupa=[^']+)'/g;
    for (const match of html.matchAll(fallbackPattern)) {
      const encodedUrl = match[1];
      if (!encodedUrl) {
        continue;
      }

      const decoded = decodeImageUrl(encodedUrl);
      if (decoded) {
        urls.push(decoded);
      }
    }
  }

  const deduped = new Set<string>();
  const orderedUrls: string[] = [];
  urls.forEach((url) => {
    if (deduped.has(url)) {
      return;
    }

    deduped.add(url);
    orderedUrls.push(url);
  });

  return orderedUrls;
};

const parseChapterPages = async (chapterUrl: string, html: string): Promise<SourcePage[]> => {
  const imageUrls = decryptPageUrls(html);

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

  return imageUrls.map((imageUrl, index) => {
    const headers: Record<string, string> = {
      Referer: `${READ_COMIC_ONLINE_BASE_URL}/`,
      "User-Agent": USER_AGENT_HEADER,
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
      "User-Agent": USER_AGENT_HEADER,
      Referer: `${READ_COMIC_ONLINE_BASE_URL}/`,
    },
  });

  return typeof response.data === "string" ? response.data : String(response.data ?? "");
};

const buildSearchUrl = (query: string, page: number): string => {
  const url = new URL("/AdvanceSearch", READ_COMIC_ONLINE_BASE_URL);
  url.searchParams.set("comicName", query);
  url.searchParams.set("page", String(page));
  return url.toString();
};

const buildListingUrl = (path: string, page: number): string => {
  const url = new URL(path, READ_COMIC_ONLINE_BASE_URL);
  url.searchParams.set("page", String(page));
  return url.toString();
};

const buildChapterReadUrl = (chapterUrl: string): string => {
  const includeQuality =
    (SOURCE_PREFERENCES.quality !== "lq" && SOURCE_PREFERENCES.server !== "s2") ||
    (SOURCE_PREFERENCES.quality === "lq" && SOURCE_PREFERENCES.server === "s2");
  const separator = chapterUrl.includes("?") ? "&" : "?";

  if (!includeQuality) {
    return `${chapterUrl}${separator}s=${SOURCE_PREFERENCES.server}&readType=1`;
  }

  return `${chapterUrl}${separator}s=${SOURCE_PREFERENCES.server}&quality=${SOURCE_PREFERENCES.quality}&readType=1`;
};

const resolveMangaUrl = (mangaIdOrUrl: string): string => toAbsoluteUrl(toPathWithQuery(mangaIdOrUrl));

const resolveChapterUrl = (chapterIdOrUrl: string): string =>
  toAbsoluteUrl(toPathWithQuery(chapterIdOrUrl));

export const readComicOnlineAdapter: SourceAdapter = {
  descriptor: {
    id: READ_COMIC_ONLINE_SOURCE_ID,
    name: "ReadComicOnline",
    language: "en",
    baseUrl: READ_COMIC_ONLINE_BASE_URL,
    isNsfw: false,
    supportsSearch: true,
    supportsPopular: true,
    supportsLatest: true,
    supportsFilters: false,
  },

  async getPopularTitles(params, context) {
    const page = params.page ?? 1;
    const html = await requestText(buildListingUrl("/ComicList/MostPopular", page), context);
    const parsed = parseListing(html);

    return {
      items: parsed.items,
      page,
      hasNextPage: parsed.hasNextPage,
    };
  },

  async getLatestUpdates(params, context) {
    const page = params.page ?? 1;
    const html = await requestText(buildListingUrl("/ComicList/LatestUpdate", page), context);
    const parsed = parseListing(html);

    return {
      items: parsed.items,
      page,
      hasNextPage: parsed.hasNextPage,
    };
  },

  async search(params, context) {
    const page = params.page ?? 1;
    const query = cleanText(params.query);
    if (!query) {
      const html = await requestText(
        buildListingUrl("/ComicList/MostPopular", page),
        context
      );
      const parsed = parseListing(html);
      return {
        items: parsed.items,
        page,
        hasNextPage: parsed.hasNextPage,
      };
    }

    const html = await requestText(buildSearchUrl(query, page), context);
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
    const html = await requestText(buildChapterReadUrl(chapterUrl), context);
    return parseChapterPages(chapterUrl, html);
  },
};
