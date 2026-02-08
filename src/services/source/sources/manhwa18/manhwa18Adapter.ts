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
const LIST_SELECTOR = "div.thumb-item-flow.col-6.col-md-2";
const CHAPTER_SELECTOR = "ul.list-chapters > a";
const PAGINATION_NEXT_SELECTOR =
  "div.pagination_wrap a.paging_item:last-of-type:not(.disabled)";
const ACCEPT_HTML_HEADER =
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

const GENERIC_WORDS_TO_REMOVE = new Set(["manhwa", "engsub"]);

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

const parseBackgroundUrl = (styleValue: string): string => {
  const match = styleValue.match(/url\((['"]?)(.*?)\1\)/i);
  return cleanText(match?.[2]);
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

const toContentId = (pathOrUrl: string): string => {
  const absolute = toAbsoluteUrl(pathOrUrl);
  if (!absolute) {
    return "";
  }

  try {
    const parsed = new URL(absolute);
    return parsed.pathname;
  } catch {
    return "";
  }
};

const resolveMangaUrl = (mangaIdOrUrl: string): string =>
  toAbsoluteUrl(toPathWithQuery(mangaIdOrUrl));

const resolveChapterUrl = (chapterIdOrUrl: string): string =>
  toAbsoluteUrl(toPathWithQuery(chapterIdOrUrl));

const hasNextPage = (root: HtmlElement): boolean => {
  if (root.querySelector(PAGINATION_NEXT_SELECTOR)) {
    return true;
  }

  return asArray(root.querySelectorAll("a[href]")).some((anchor) => {
    const rel = toLower(anchor.getAttribute("rel"));
    const ariaLabel = toLower(anchor.getAttribute("aria-label"));
    const text = toLower(anchor.textContent);
    return rel === "next" || ariaLabel.includes("next") || text === "next";
  });
};

const getCoverFromCard = (entry: HtmlElement): string => {
  const coverContainer = entry.querySelector("div.content.img-in-ratio");
  if (!coverContainer) {
    return "";
  }

  const dataBg = cleanText(coverContainer.getAttribute("data-bg"));
  if (dataBg) {
    return toAbsoluteUrl(dataBg);
  }

  const inlineStyle = cleanText(coverContainer.getAttribute("style"));
  const fromStyle = parseBackgroundUrl(inlineStyle);
  if (fromStyle) {
    return toAbsoluteUrl(fromStyle);
  }

  const nestedImage = coverContainer.querySelector("img");
  const nestedImageUrl = cleanText(
    nestedImage?.getAttribute("data-src") || nestedImage?.getAttribute("src")
  );
  return toAbsoluteUrl(nestedImageUrl);
};

const parseListing = (html: string): { items: SourceManga[]; hasNextPage: boolean } => {
  const root = parseHtmlRoot(html);
  const cards = asArray(root.querySelectorAll(LIST_SELECTOR));

  const items = cards
    .map((entry): SourceManga | null => {
      const linkElement = entry.querySelector("a[href]");
      const titleElement =
        entry.querySelector("div.thumb_attr.series-title a[title]") ??
        entry.querySelector("div.thumb_attr.series-title a");

      const rawUrl = cleanText(linkElement?.getAttribute("href"));
      const url = toAbsoluteUrl(rawUrl);
      const id = toContentId(url);
      const title =
        cleanText(titleElement?.getAttribute("title")) || cleanText(titleElement?.textContent);

      if (!id || !title || !url) {
        return null;
      }

      return {
        id,
        title,
        url,
        thumbnailUrl: getCoverFromCard(entry) || undefined,
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
    hasNextPage: hasNextPage(root),
  };
};

const parseStatus = (statusValue: string): SourceMangaDetails["status"] => {
  const normalized = toLower(statusValue);

  if (normalized.includes("on going") || normalized.includes("ongoing")) {
    return "ongoing";
  }

  if (normalized.includes("on hold") || normalized.includes("hiatus")) {
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

const parsePeople = (value: string): string[] =>
  value
    .split(/[;,/]| and /i)
    .map(cleanText)
    .filter(Boolean);

const removeGenericWords = (value: string): string =>
  value
    .split(/\s+/)
    .filter((word) => !GENERIC_WORDS_TO_REMOVE.has(word.toLowerCase()))
    .join(" ")
    .trim();

const parseAlternativeTitles = (value: string): string[] => {
  const unique = new Set<string>();
  value
    .split(/[,;]+/)
    .map(cleanText)
    .map(removeGenericWords)
    .filter(Boolean)
    .forEach((entry) => unique.add(entry));

  return Array.from(unique);
};

const parseDateUpdated = (value: string): string | undefined => {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return undefined;
  }

  const datePart = cleaned.includes(" - ")
    ? cleanText(cleaned.split(" - ").pop())
    : cleaned;
  if (!datePart) {
    return undefined;
  }

  const timestamp = Date.parse(datePart);
  if (Number.isNaN(timestamp)) {
    return datePart;
  }

  return new Date(timestamp).toISOString().split("T")[0];
};

const parseChapterNumber = (title: string): number | undefined => {
  const normalizedTitle = toLower(title);
  const primaryMatch = title.match(/([+-]?(?:[0-9]*[.])?[0-9]+)/);

  if (normalizedTitle.startsWith("vol")) {
    const matches = title.match(/([+-]?(?:[0-9]*[.])?[0-9]+)/g);
    if (matches && matches.length > 1) {
      const parsed = Number.parseFloat(matches[1]);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
  }

  if (!primaryMatch) {
    return undefined;
  }

  const parsed = Number.parseFloat(primaryMatch[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseMangaDetails = (mangaUrl: string, html: string): SourceMangaDetails => {
  const root = parseHtmlRoot(html);
  const title = cleanText(root.querySelector(".series-name")?.textContent);

  const coverContainer = root.querySelector("div.content.img-in-ratio");
  const coverFromDataBg = cleanText(coverContainer?.getAttribute("data-bg"));
  const coverFromStyle = parseBackgroundUrl(cleanText(coverContainer?.getAttribute("style")));

  const description = cleanText(root.querySelector(".summary-content")?.textContent);
  const authors = new Set<string>();
  const alternativeNameParts: string[] = [];
  let status: SourceMangaDetails["status"] = "unknown";

  asArray(root.querySelectorAll(".info-item")).forEach((item) => {
    const label = toLower(item.querySelector(".info-name")?.textContent);
    const value = cleanText(item.querySelector(".info-value")?.textContent);
    if (!value) {
      return;
    }

    if (label.includes("author")) {
      parsePeople(value).forEach((author) => authors.add(author));
      return;
    }

    if (label.includes("other name") || label.includes("doujinshi")) {
      alternativeNameParts.push(value);
      return;
    }

    if (label.includes("status")) {
      status = parseStatus(value);
    }
  });

  const genres = new Set<string>();
  asArray(root.querySelectorAll("a[href*=the-loai] span.badge")).forEach((genreNode) => {
    const genre = cleanText(genreNode.textContent);
    if (genre) {
      genres.add(genre);
    }
  });
  asArray(root.querySelectorAll("a[href*=genre] span.badge")).forEach((genreNode) => {
    const genre = cleanText(genreNode.textContent);
    if (genre) {
      genres.add(genre);
    }
  });

  const alternativeTitles = parseAlternativeTitles(alternativeNameParts.join(", "));

  return {
    id: toContentId(mangaUrl),
    title,
    url: mangaUrl,
    thumbnailUrl: toAbsoluteUrl(coverFromDataBg || coverFromStyle) || undefined,
    description: description || undefined,
    alternativeTitles: alternativeTitles.length ? alternativeTitles : undefined,
    authors: Array.from(authors),
    genres: Array.from(genres),
    status,
  };
};

const parseChapters = (mangaUrl: string, html: string): SourceChapter[] => {
  const root = parseHtmlRoot(html);
  const scanlatorText = cleanText(root.querySelector("div.fantrans-value a")?.textContent);
  const normalizedScanlator = toLower(scanlatorText);
  const scanlator =
    scanlatorText &&
    normalizedScanlator !== "đang cập nhật" &&
    normalizedScanlator !== "updating"
      ? scanlatorText
      : undefined;

  const chapters = asArray(root.querySelectorAll(CHAPTER_SELECTOR))
    .map((entry): SourceChapter | null => {
      const rawUrl = cleanText(entry.getAttribute("href"));
      const url = toAbsoluteUrl(rawUrl);
      const id = toContentId(url);
      if (!id || !url) {
        return null;
      }

      const title = cleanText(entry.querySelector("div.chapter-name")?.textContent);
      const uploadedAt = parseDateUpdated(
        cleanText(entry.querySelector("div.chapter-time")?.textContent)
      );

      return {
        id,
        title: title || `Chapter ${id.split("/").filter(Boolean).pop() ?? ""}`,
        url,
        number: parseChapterNumber(title),
        uploadedAt,
        scanlator,
      };
    })
    .filter((chapter): chapter is SourceChapter => Boolean(chapter));

  const deduplicated = new Map<string, SourceChapter>();
  chapters.forEach((chapter) => {
    if (!deduplicated.has(chapter.id)) {
      deduplicated.set(chapter.id, chapter);
    }
  });

  return Array.from(deduplicated.values());
};

const parseChapterPages = async (
  chapterUrl: string,
  html: string
): Promise<SourcePage[]> => {
  const root = parseHtmlRoot(html);
  const imageNodes = asArray(root.querySelectorAll("div#chapter-content img"));
  const cookieHeader = await getCookieHeaderForUrl(chapterUrl);

  return imageNodes
    .map((imageNode, index): SourcePage | null => {
      const imageUrl = toAbsoluteUrl(
        cleanText(imageNode.getAttribute("data-src")) ||
          cleanText(imageNode.getAttribute("src"))
      );
      if (!imageUrl) {
        return null;
      }

      const headers: Record<string, string> = {
        Referer: `${MANHWA18_BASE_URL}/`,
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

const buildListUrl = (params: URLSearchParams): string =>
  `${MANHWA18_BASE_URL}/tim-kiem?${params.toString()}`;

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

    if (toLower(query).startsWith(DIRECT_URL_PREFIX)) {
      const directUrl = cleanText(query.slice(DIRECT_URL_PREFIX.length));
      if (!directUrl) {
        return { items: [], page, hasNextPage: false };
      }

      const mangaUrl = resolveMangaUrl(directUrl);
      const html = await requestText(mangaUrl, context);
      const details = parseMangaDetails(mangaUrl, html);

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
      q: query,
      page: String(page),
    });

    const html = await requestText(buildListUrl(queryParams), context);
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
      sort: "top",
      page: String(page),
    });

    const html = await requestText(buildListUrl(queryParams), context);
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
      sort: "update",
      page: String(page),
    });

    const html = await requestText(buildListUrl(queryParams), context);
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
    return parseChapters(mangaUrl, html);
  },

  async getChapterPages(chapterId, context) {
    const chapterUrl = resolveChapterUrl(chapterId);
    const html = await requestText(chapterUrl, context);
    return parseChapterPages(chapterUrl, html);
  },
};
