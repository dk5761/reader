import IDOMParser from "advanced-html-parser";
import { getCookieHeaderForUrl } from "@/services/cookies/cookieStore";
import type {
  SourceAdapter,
  SourceAdapterContext,
  SourceChapter,
  SourceManga,
  SourceMangaDetails,
  SourcePage,
  SourceSearchParams,
} from "../../core";

const ASURA_SOURCE_ID = "asurascans";
const ASURA_BASE_URL = "https://asurascans.com";
const ASURA_API_URL = "https://api.asurascans.com/api";
const ASURA_PAGE_SIZE = 20;

const IMAGE_ATTRIBUTES = ["data-src", "src", "data-lazy-src"];
const SERIES_REQUEST_TIMEOUT_MS = 45000;
const SERIES_HTML_CACHE_TTL_MS = 15000;

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: "\"",
};

interface HtmlElement {
  querySelector: (selector: string) => HtmlElement | null;
  querySelectorAll: (selector: string) => Set<HtmlElement>;
  getAttribute: (attrName: string) => string;
  textContent?: string;
}

interface AsuraGenreDto {
  name?: string;
}

interface AsuraChapterDto {
  number?: number | string;
  title?: string | null;
  created_at?: string;
  published_at?: string;
  early_access_until?: string;
  is_premium?: boolean;
  is_locked?: boolean;
  series_slug?: string | null;
}

interface AsuraPageDto {
  url?: string;
  width?: number;
  height?: number;
  tiles?: number[];
  tile_cols?: number;
  tile_rows?: number;
}

interface AsuraSeriesDto {
  slug?: string;
  public_url?: string;
  title?: string;
  cover?: string;
  author?: string | null;
  artist?: string | null;
  description?: string | null;
  genres?: AsuraGenreDto[] | null;
  status?: string | null;
  type?: string | null;
  alt_titles?: string[] | null;
  alternative_titles?: string[] | null;
}

interface AsuraListResponse {
  data?: AsuraSeriesDto[] | null;
  meta?: {
    has_more?: boolean | null;
  } | null;
}

interface AsuraDetailsResponse {
  series?: AsuraSeriesDto;
}

interface JsonLdPerson {
  name?: string;
}

interface JsonLdComicSeries {
  "@type"?: string | string[];
  name?: string;
  alternateName?: string | string[];
  description?: string;
  url?: string;
  image?: string | { url?: string };
  genre?: string | string[];
  author?: JsonLdPerson | JsonLdPerson[];
  illustrator?: JsonLdPerson | JsonLdPerson[];
}

interface AsuraPremiumChapterResponse {
  data?: {
    chapter?: {
      title?: string | null;
      number?: string | number;
      pages?: AsuraPageDto[];
    };
  };
}

interface ChapterReference {
  stableSlug: string;
  comicSlug?: string;
  chapterNumber: string;
}

const stableToComicSlugMap = new Map<string, string>();
const comicToStableSlugMap = new Map<string, string>();

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

const getMetaContent = (html: string, attribute: string, value: string): string => {
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+${attribute}=["']${escapedValue}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+${attribute}=["']${escapedValue}["'][^>]*>`,
      "i"
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtmlEntities(cleanText(match[1]));
    }
  }

  return "";
};

const getTitleFromHtml = (html: string): string => {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (!titleMatch?.[1]) {
    return "";
  }

  return decodeHtmlEntities(cleanText(titleMatch[1])).replace(/\s*\|\s*Asura Scans\s*$/i, "");
};

const extractJsonLdBlocks = (html: string): unknown[] => {
  const matches = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  const blocks: unknown[] = [];

  for (const match of matches) {
    const content = cleanText(match[1]);
    if (!content) {
      continue;
    }

    try {
      blocks.push(JSON.parse(content));
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }

  return blocks;
};

const hasJsonLdType = (value: string | string[] | undefined, targetType: string): boolean => {
  if (typeof value === "string") {
    return value === targetType;
  }

  if (Array.isArray(value)) {
    return value.includes(targetType);
  }

  return false;
};

const extractJsonLdComicSeries = (html: string): JsonLdComicSeries | undefined =>
  extractJsonLdBlocks(html).find(
    (entry): entry is JsonLdComicSeries =>
      isRecord(entry) && hasJsonLdType(entry["@type"] as string | string[] | undefined, "ComicSeries")
  );

const decodeHtmlEntities = (value: string): string =>
  value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase();

    if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return HTML_ENTITY_MAP[normalized] ?? match;
  });

const htmlToPlainText = (html: string | null | undefined): string => {
  const value = cleanText(html);
  if (!value) {
    return "";
  }

  try {
    const parsedDocument = IDOMParser.parse(`<div>${value}</div>`, { onlyBody: true });
    const text = cleanText((parsedDocument.documentElement as unknown as HtmlElement).textContent);
    if (text) {
      return decodeHtmlEntities(text);
    }
  } catch {
    // Fall back to a simple tag strip.
  }

  return cleanText(decodeHtmlEntities(value.replace(/<[^>]+>/g, " ")));
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
    return `${ASURA_BASE_URL}${value}`;
  }

  return `${ASURA_BASE_URL}/${value}`;
};

const getPathFromInput = (pathOrUrl: string): string => {
  const value = cleanText(pathOrUrl);
  if (!value) {
    return "";
  }

  if (isAbsoluteHttpUrl(value)) {
    return new URL(value).pathname;
  }

  return value.startsWith("/") ? value : `/${value.replace(/^\/+/, "")}`;
};

const splitPathSegments = (pathOrUrl: string): string[] =>
  getPathFromInput(pathOrUrl)
    .split("/")
    .map((segment) => cleanText(segment))
    .filter(Boolean);

const deriveStableSlugFromComicSlug = (comicSlug: string): string => {
  const value = cleanText(comicSlug);
  if (!value) {
    return "";
  }

  const remembered = comicToStableSlugMap.get(value);
  if (remembered) {
    return remembered;
  }

  const withoutRandomSuffix = value.replace(/-[a-z0-9]{6,}$/i, "");
  return withoutRandomSuffix || value;
};

const rememberSeriesSlug = (
  stableSlugInput: string | null | undefined,
  publicUrlInput: string | null | undefined
): void => {
  const stableSlug = cleanText(stableSlugInput);
  const publicUrl = cleanText(publicUrlInput);
  const comicSlug = splitPathSegments(publicUrl)[1] ?? "";

  if (!stableSlug || !comicSlug) {
    return;
  }

  stableToComicSlugMap.set(stableSlug, comicSlug);
  comicToStableSlugMap.set(comicSlug, stableSlug);
};

const toSeriesId = (stableSlug: string): string => `/series/${stableSlug}`;

const formatChapterNumber = (value: string | number): string => {
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(value);
  }

  const cleaned = cleanText(value);
  if (!cleaned) {
    return "";
  }

  const parsed = Number.parseFloat(cleaned);
  if (Number.isFinite(parsed) && String(parsed) === cleaned) {
    return Number.isInteger(parsed) ? String(parsed) : String(parsed);
  }

  return cleaned;
};

const toChapterId = (stableSlug: string, chapterNumber: string | number): string =>
  `${toSeriesId(stableSlug)}/chapter/${formatChapterNumber(chapterNumber)}`;

const parseStatus = (statusValue: string | null | undefined): SourceMangaDetails["status"] => {
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

const parseChapterNumber = (title: string | number | null | undefined): number | undefined => {
  const value = typeof title === "number" ? String(title) : cleanText(title);
  const match = value.match(/([+-]?\d+(?:\.\d+)?)/);
  if (!match) {
    return undefined;
  }

  const parsedNumber = Number.parseFloat(match[1]);
  return Number.isFinite(parsedNumber) ? parsedNumber : undefined;
};

const parseChapterDate = (
  ...rawValues: (string | null | undefined)[]
): string | undefined => {
  const selected = rawValues.map((value) => cleanText(value)).find(Boolean);
  if (!selected || selected.startsWith("0001-")) {
    return undefined;
  }

  const withoutOrdinalSuffix = selected.replace(/(\d+)(st|nd|rd|th)\b/gi, "$1");
  const timestamp = Date.parse(withoutOrdinalSuffix);
  if (Number.isNaN(timestamp)) {
    return selected;
  }

  return new Date(timestamp).toISOString().split("T")[0];
};

const parseCookieValue = (cookieHeader: string, cookieName: string): string | undefined =>
  cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);

const getImageUrl = (element: HtmlElement | null): string => {
  if (!element) {
    return "";
  }

  for (const attribute of IMAGE_ATTRIBUTES) {
    const value = cleanText(element.getAttribute(attribute));
    if (!value || value.startsWith("data:image")) {
      continue;
    }

    return toAbsoluteUrl(value);
  }

  return "";
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

const extractAstroPropsBlobs = (html: string): string[] => {
  const matches = html.matchAll(/\sprops="([^"]*)"/g);
  const blobs: string[] = [];

  for (const match of matches) {
    const blob = match[1];
    if (blob) {
      blobs.push(blob);
    }
  }

  return blobs;
};

const unwrapAstroValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    const [first, second] = value;
    const isTaggedTuple =
      value.length === 2 &&
      typeof first === "number" &&
      Number.isInteger(first) &&
      first >= 0 &&
      first <= 11;

    if (isTaggedTuple) {
      return unwrapAstroValue(second);
    }

    return value.map((entry) => unwrapAstroValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, unwrapAstroValue(entryValue)])
    );
  }

  return value;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const extractAstroRecord = (
  html: string,
  requiredKeys: string[]
): Record<string, unknown> | undefined => {
  const blobs = extractAstroPropsBlobs(html);

  for (const blob of blobs) {
    const decoded = decodeHtmlEntities(blob);

    if (!requiredKeys.every((key) => decoded.includes(`"${key}"`))) {
      continue;
    }

    try {
      const parsed = JSON.parse(decoded) as unknown;
      const unwrapped = unwrapAstroValue(parsed);

      if (isRecord(unwrapped) && requiredKeys.every((key) => key in unwrapped)) {
        return unwrapped;
      }
    } catch {
      // Ignore malformed props payloads.
    }
  }

  return undefined;
};

const extractAstroProp = <T>(html: string, key: string): T | undefined => {
  const record = extractAstroRecord(html, [key]);
  return record?.[key] as T | undefined;
};

const extractPageToken = (html: string): string | undefined => {
  const patterns = [
    /pageToken\*=\*"([^"]+)"/i,
    /"pageToken":"([^"]+)"/i,
    /'pageToken':'([^']+)'/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return cleanText(match[1]);
    }
  }

  return undefined;
};

const mapSeriesToSourceManga = (series: AsuraSeriesDto): SourceManga | null => {
  const stableSlug = cleanText(series.slug);
  const title = cleanText(series.title);
  if (!stableSlug || !title) {
    return null;
  }

  rememberSeriesSlug(stableSlug, series.public_url);

  const comicSlug = stableToComicSlugMap.get(stableSlug) ?? stableSlug;
  const mangaUrl = toAbsoluteUrl(series.public_url || `/comics/${comicSlug}`);

  return {
    id: toSeriesId(stableSlug),
    title,
    url: mangaUrl,
    thumbnailUrl: cleanText(series.cover) || undefined,
  };
};

const mapSeriesToMangaDetails = (series: AsuraSeriesDto): SourceMangaDetails | null => {
  const base = mapSeriesToSourceManga(series);
  if (!base) {
    return null;
  }

  const authors = cleanText(series.author) ? [cleanText(series.author)] : [];
  const artists = cleanText(series.artist) ? [cleanText(series.artist)] : [];
  const genres = [
    ...new Set(
      [
        cleanText(series.type),
        ...(series.genres ?? []).map((genre) => cleanText(genre.name)),
      ].filter(Boolean)
    ),
  ];

  const alternativeTitles = [
    ...new Set([...(series.alt_titles ?? []), ...(series.alternative_titles ?? [])].map(cleanText)),
  ].filter(Boolean);

  return {
    ...base,
    description: htmlToPlainText(series.description) || undefined,
    alternativeTitles: alternativeTitles.length ? alternativeTitles : undefined,
    authors,
    artists,
    genres,
    status: parseStatus(series.status),
  };
};

const toNameList = (
  value: JsonLdPerson | JsonLdPerson[] | string | string[] | undefined
): string[] => {
  if (typeof value === "string") {
    return cleanText(value) ? [cleanText(value)] : [];
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => {
        if (typeof entry === "string") {
          return cleanText(entry) ? [cleanText(entry)] : [];
        }

        return cleanText(entry?.name) ? [cleanText(entry.name)] : [];
      })
      .filter(Boolean);
  }

  const name = cleanText(value?.name);
  return name ? [name] : [];
};

const parseMangaDetailsFromHtml = (
  stableSlug: string,
  comicSlug: string,
  html: string
): SourceMangaDetails => {
  const jsonLd = extractJsonLdComicSeries(html);
  const title = cleanText(jsonLd?.name) || getTitleFromHtml(html) || stableSlug;
  const description =
    cleanText(jsonLd?.description) || getMetaContent(html, "name", "description");
  const image =
    typeof jsonLd?.image === "string"
      ? cleanText(jsonLd.image)
      : cleanText(jsonLd?.image?.url) || getMetaContent(html, "property", "og:image");
  const alternativeTitles = (
    Array.isArray(jsonLd?.alternateName) ? jsonLd.alternateName : [jsonLd?.alternateName]
  )
    .map((entry) => cleanText(entry))
    .filter(Boolean);
  const genres = (
    Array.isArray(jsonLd?.genre) ? jsonLd.genre : [jsonLd?.genre]
  )
    .map((entry) => cleanText(entry))
    .filter(Boolean);
  const authors = toNameList(jsonLd?.author);
  const artists = toNameList(jsonLd?.illustrator);

  return {
    id: toSeriesId(stableSlug),
    title,
    url: buildComicUrl(comicSlug),
    thumbnailUrl: image || undefined,
    description: description || undefined,
    alternativeTitles: alternativeTitles.length ? alternativeTitles : undefined,
    authors,
    artists,
    genres,
    status: "unknown",
  };
};

const buildChapterTitle = (chapter: AsuraChapterDto, fallbackNumber: string): string => {
  const chapterNumber = formatChapterNumber(chapter.number ?? fallbackNumber);
  const titleSuffix = cleanText(chapter.title);
  const lockPrefix = chapter.is_locked || chapter.is_premium ? "🔒 " : "";

  if (titleSuffix) {
    return `${lockPrefix}Chapter ${chapterNumber} - ${titleSuffix}`;
  }

  return `${lockPrefix}Chapter ${chapterNumber}`;
};

const mapChapterToSourceChapter = (
  chapter: AsuraChapterDto,
  stableSlug: string
): SourceChapter | null => {
  const rawNumber = chapter.number ?? "";
  const formattedNumber = formatChapterNumber(rawNumber);
  if (!stableSlug || !formattedNumber) {
    return null;
  }

  return {
    id: toChapterId(stableSlug, formattedNumber),
    title: buildChapterTitle(chapter, formattedNumber),
    url: toAbsoluteUrl(
      `/comics/${stableToComicSlugMap.get(stableSlug) ?? stableSlug}/chapter/${formattedNumber}`
    ),
    number: parseChapterNumber(rawNumber),
    uploadedAt: parseChapterDate(
      chapter.published_at,
      chapter.created_at,
      chapter.early_access_until
    ),
    scanlator: undefined,
  };
};

const parseAstroChapters = (stableSlug: string, html: string): SourceChapter[] => {
  const chapters = extractAstroProp<AsuraChapterDto[]>(html, "chapters") ?? [];
  const parsedChapters = chapters
    .map((chapter) => mapChapterToSourceChapter(chapter, stableSlug))
    .filter((chapter): chapter is SourceChapter =>
      Boolean(chapter && chapter.id && chapter.url && chapter.title)
    );

  const uniqueChapterById = new Map<string, SourceChapter>();
  parsedChapters.forEach((chapter) => {
    if (!uniqueChapterById.has(chapter.id)) {
      uniqueChapterById.set(chapter.id, chapter);
    }
  });

  return Array.from(uniqueChapterById.values());
};

const buildSeriesApiParams = (
  params: SourceSearchParams | { page?: number; limit?: number },
  options: { query?: string; sort: string }
): Record<string, string | number> => {
  const page = params.page ?? 1;
  const limit = params.limit ?? ASURA_PAGE_SIZE;
  const offset = Math.max(0, page - 1) * limit;

  const result: Record<string, string | number> = {
    limit,
    offset,
    sort: options.sort,
  };

  const query = cleanText(options.query);
  if (query) {
    result.search = query;
  }

  return result;
};

const requestText = async (
  url: string,
  context: SourceAdapterContext,
  options?: { timeoutMs?: number; headers?: Record<string, string> }
): Promise<string> => {
  const response = await context.http.get<string>(url, {
    responseType: "text",
    timeoutMs: options?.timeoutMs,
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      ...(options?.headers ?? {}),
    },
  });

  return typeof response.data === "string" ? response.data : String(response.data ?? "");
};

const requestJson = async <T>(
  url: string,
  context: SourceAdapterContext,
  options?: {
    headers?: Record<string, string>;
    params?: Record<string, string | number | boolean | undefined>;
    timeoutMs?: number;
  }
): Promise<T> => {
  const response = await context.http.get<T>(url, {
    headers: {
      Accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
      ...(options?.headers ?? {}),
    },
    params: options?.params,
    timeoutMs: options?.timeoutMs,
  });

  return response.data;
};

const seriesHtmlCache = new Map<string, { html: string; expiresAt: number }>();
const seriesHtmlInFlight = new Map<string, Promise<string>>();

const requestSeriesText = async (
  seriesUrl: string,
  context: SourceAdapterContext
): Promise<string> => {
  const now = Date.now();
  const cached = seriesHtmlCache.get(seriesUrl);
  if (cached && cached.expiresAt > now) {
    return cached.html;
  }

  const inFlight = seriesHtmlInFlight.get(seriesUrl);
  if (inFlight) {
    return inFlight;
  }

  const requestPromise = requestText(seriesUrl, context, {
    timeoutMs: SERIES_REQUEST_TIMEOUT_MS,
  })
    .then((html) => {
      seriesHtmlCache.set(seriesUrl, {
        html,
        expiresAt: Date.now() + SERIES_HTML_CACHE_TTL_MS,
      });
      return html;
    })
    .finally(() => {
      seriesHtmlInFlight.delete(seriesUrl);
    });

  seriesHtmlInFlight.set(seriesUrl, requestPromise);
  return requestPromise;
};

const resolveStableSlug = (mangaIdOrUrl: string): string => {
  const pathSegments = splitPathSegments(mangaIdOrUrl);

  if (pathSegments[0] === "series" && pathSegments[1]) {
    return pathSegments[1];
  }

  if (pathSegments[0] === "comics" && pathSegments[1]) {
    return deriveStableSlugFromComicSlug(pathSegments[1]);
  }

  return cleanText(mangaIdOrUrl).replace(/^\/+|\/+$/g, "");
};

const resolveSeriesApiSlug = (mangaIdOrUrl: string): string => {
  const pathSegments = splitPathSegments(mangaIdOrUrl);

  if ((pathSegments[0] === "series" || pathSegments[0] === "comics") && pathSegments[1]) {
    return pathSegments[1];
  }

  return cleanText(mangaIdOrUrl).replace(/^\/+|\/+$/g, "");
};

const buildComicUrl = (comicSlug: string): string => toAbsoluteUrl(`/comics/${comicSlug}`);

const buildChapterUrl = (comicSlug: string, chapterNumber: string): string =>
  toAbsoluteUrl(`/comics/${comicSlug}/chapter/${chapterNumber}`);

const fetchSeriesDetails = async (
  mangaIdOrUrl: string,
  context: SourceAdapterContext
): Promise<AsuraSeriesDto> => {
  const seriesSlug = resolveSeriesApiSlug(mangaIdOrUrl);
  const response = await requestJson<AsuraDetailsResponse | AsuraSeriesDto>(
    `${ASURA_API_URL}/series/${seriesSlug}`,
    context,
    { timeoutMs: SERIES_REQUEST_TIMEOUT_MS }
  );

  const series = "series" in (response as AsuraDetailsResponse)
    ? (response as AsuraDetailsResponse).series
    : (response as AsuraSeriesDto);

  if (!series) {
    throw new Error(`Unable to load Asura series details for ${seriesSlug}`);
  }

  rememberSeriesSlug(series.slug, series.public_url);
  return series;
};

const ensureComicSlug = async (
  mangaIdOrUrl: string,
  context: SourceAdapterContext
): Promise<{ stableSlug: string; comicSlug: string }> => {
  const stableSlug = resolveStableSlug(mangaIdOrUrl);
  const rememberedComicSlug = stableToComicSlugMap.get(stableSlug);

  if (rememberedComicSlug) {
    return { stableSlug, comicSlug: rememberedComicSlug };
  }

  const series = await fetchSeriesDetails(mangaIdOrUrl, context);
  const finalStableSlug = cleanText(series.slug) || stableSlug;
  const comicSlug =
    stableToComicSlugMap.get(finalStableSlug) ??
    splitPathSegments(series.public_url ?? "")[1] ??
    resolveSeriesApiSlug(mangaIdOrUrl);

  rememberSeriesSlug(finalStableSlug, series.public_url);
  return { stableSlug: finalStableSlug, comicSlug };
};

const parseChapterReference = (chapterIdOrUrl: string): ChapterReference => {
  const pathSegments = splitPathSegments(chapterIdOrUrl);

  if (pathSegments[0] === "series" && pathSegments[1] && pathSegments[2] === "chapter") {
    return {
      stableSlug: pathSegments[1],
      chapterNumber: cleanText(pathSegments[3]),
    };
  }

  if (pathSegments[0] === "comics" && pathSegments[1] && pathSegments[2] === "chapter") {
    return {
      stableSlug: deriveStableSlugFromComicSlug(pathSegments[1]),
      comicSlug: pathSegments[1],
      chapterNumber: cleanText(pathSegments[3]),
    };
  }

  throw new Error(`Unsupported Asura chapter reference: ${chapterIdOrUrl}`);
};

const parsePublicChapterPages = (
  chapterUrl: string,
  html: string
): { pages: SourcePage[]; chapterTitle?: string; chapterNumber?: number } => {
  const astroReader = extractAstroRecord(html, ["pages", "chapterNumber"]);
  const rawPages = Array.isArray(astroReader?.pages) ? (astroReader.pages as AsuraPageDto[]) : [];
  const chapterTitle = cleanText((astroReader?.chapterTitle as string | undefined) ?? "");
  const rawChapterName = cleanText(String(astroReader?.chapterName ?? ""));
  const parsedChapterNumber =
    parseChapterNumber(astroReader?.chapterNumber as string | number | undefined) ??
    parseChapterNumber(rawChapterName);

  const pages = rawPages
    .map((page, index): SourcePage | null => {
      const imageUrl = toAbsoluteUrl(page.url ?? "");
      if (!imageUrl) {
        return null;
      }

      return {
        index,
        imageUrl,
        headers: {
          Referer: `${ASURA_BASE_URL}/`,
        },
        width: Number.isFinite(page.width) ? page.width : undefined,
        height: Number.isFinite(page.height) ? page.height : undefined,
        chapterTitle: chapterTitle || (rawChapterName ? `Chapter ${rawChapterName}` : undefined),
        chapterNumber: parsedChapterNumber,
      };
    })
    .filter((page): page is SourcePage => Boolean(page));

  return {
    pages,
    chapterTitle: chapterTitle || undefined,
    chapterNumber: parsedChapterNumber,
  };
};

const fetchPremiumChapterPages = async (
  comicSlug: string,
  chapterNumber: string,
  chapterUrl: string,
  html: string,
  context: SourceAdapterContext
): Promise<SourcePage[]> => {
  const cookieHeader = await getCookieHeaderForUrl(chapterUrl);
  const accessToken = cookieHeader ? parseCookieValue(cookieHeader, "access_token") : undefined;
  const pageToken = extractPageToken(html) || "asura-reader-2026";

  const headers: Record<string, string> = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  if (pageToken) {
    headers["X-Page-Token"] = pageToken;
  }

  const response = await requestJson<AsuraPremiumChapterResponse>(
    `${ASURA_API_URL}/series/${comicSlug}/chapters/${chapterNumber}`,
    context,
    {
      headers,
      timeoutMs: SERIES_REQUEST_TIMEOUT_MS,
    }
  );

  return (response.data?.chapter?.pages ?? [])
    .map((page, index): SourcePage | null => {
      const imageUrl = toAbsoluteUrl(page.url ?? "");
      if (!imageUrl) {
        return null;
      }

      return {
        index,
        imageUrl,
        headers: {
          Referer: `${ASURA_BASE_URL}/`,
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
        width: Number.isFinite(page.width) ? page.width : undefined,
        height: Number.isFinite(page.height) ? page.height : undefined,
      };
    })
    .filter((page): page is SourcePage => Boolean(page));
};

const fetchChapterPagesFromApi = async (
  comicSlug: string,
  chapterNumber: string,
  context: SourceAdapterContext
): Promise<SourcePage[]> => {
  const response = await requestJson<AsuraPremiumChapterResponse>(
    `${ASURA_API_URL}/series/${comicSlug}/chapters/${chapterNumber}`,
    context,
    {
      timeoutMs: SERIES_REQUEST_TIMEOUT_MS,
    }
  );

  const apiChapter = response.data?.chapter;
  const parsedChapterNumber =
    parseChapterNumber(apiChapter?.number) ?? parseChapterNumber(chapterNumber);
  const parsedChapterTitle = cleanText(apiChapter?.title);

  return (apiChapter?.pages ?? [])
    .map((page, index): SourcePage | null => {
      const imageUrl = toAbsoluteUrl(page.url ?? "");
      if (!imageUrl) {
        return null;
      }

      return {
        index,
        imageUrl,
        headers: {
          Referer: `${ASURA_BASE_URL}/`,
        },
        width: Number.isFinite(page.width) ? page.width : undefined,
        height: Number.isFinite(page.height) ? page.height : undefined,
        chapterTitle:
          parsedChapterTitle ||
          (parsedChapterNumber !== undefined ? `Chapter ${parsedChapterNumber}` : undefined),
        chapterNumber: parsedChapterNumber,
      };
    })
    .filter((page): page is SourcePage => Boolean(page));
};

const parseFallbackListing = (html: string): { items: SourceManga[]; hasNextPage: boolean } => {
  const root = parseHtmlRoot(html);
  const entries = asArray(
    root.querySelectorAll("a[href^='/comics/'], .series-card a[href^='/comics/']")
  );

  const items = entries
    .map((entry): SourceManga | null => {
      const href = cleanText(entry.getAttribute("href"));
      const comicSlug = splitPathSegments(href)[1];
      const stableSlug = deriveStableSlugFromComicSlug(comicSlug ?? "");
      const titleElement =
        entry.querySelector("h3") ?? entry.querySelector("span.block.font-bold");
      const imageElement = entry.querySelector("img");
      const title = cleanText(titleElement?.textContent);

      if (!stableSlug || !title) {
        return null;
      }

      rememberSeriesSlug(stableSlug, href);

      return {
        id: toSeriesId(stableSlug),
        title,
        url: toAbsoluteUrl(href),
        thumbnailUrl: getImageUrl(imageElement) || undefined,
      };
    })
    .filter((item): item is SourceManga => Boolean(item));

  return {
    items,
    hasNextPage: hasNextPageLink(root),
  };
};

const fetchSeriesPage = async (
  params: SourceSearchParams | { page?: number; limit?: number },
  context: SourceAdapterContext,
  options: { query?: string; sort: string }
): Promise<{ items: SourceManga[]; page: number; hasNextPage: boolean }> => {
  const page = params.page ?? 1;
  const limit = params.limit ?? ASURA_PAGE_SIZE;

  try {
    const response = await requestJson<AsuraListResponse>(`${ASURA_API_URL}/series`, context, {
      params: buildSeriesApiParams(params, options),
      timeoutMs: SERIES_REQUEST_TIMEOUT_MS,
    });

    const items = (response.data ?? [])
      .map((series) => mapSeriesToSourceManga(series))
      .filter((item): item is SourceManga => Boolean(item));

    return {
      items,
      page,
      hasNextPage: response.meta?.has_more ?? items.length >= limit,
    };
  } catch {
    const browseUrl =
      options.query && cleanText(options.query)
        ? `${ASURA_BASE_URL}/browse?search=${encodeURIComponent(cleanText(options.query))}&page=${page}`
        : `${ASURA_BASE_URL}/browse?page=${page}`;

    const fallback = parseFallbackListing(await requestText(browseUrl, context));
    return {
      items: fallback.items,
      page,
      hasNextPage: fallback.hasNextPage,
    };
  }
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
    return fetchSeriesPage(params, context, {
      query: params.query,
      sort: "rating",
    });
  },

  async getPopularTitles(params, context) {
    return fetchSeriesPage(params, context, {
      sort: "popular",
    });
  },

  async getLatestUpdates(params, context) {
    return fetchSeriesPage(params, context, {
      sort: "latest",
    });
  },

  async getMangaDetails(mangaId, context) {
    try {
      const series = await fetchSeriesDetails(mangaId, context);
      const details = mapSeriesToMangaDetails(series);

      if (details) {
        return details;
      }
    } catch {
      // Fall through to the comic page HTML, which still exposes the metadata.
    }

    const { stableSlug, comicSlug } = await ensureComicSlug(mangaId, context);
    const mangaUrl = buildComicUrl(comicSlug);
    const html = await requestSeriesText(mangaUrl, context);
    return parseMangaDetailsFromHtml(stableSlug, comicSlug, html);
  },

  async getChapters(mangaId, context) {
    const { stableSlug, comicSlug } = await ensureComicSlug(mangaId, context);
    const mangaUrl = buildComicUrl(comicSlug);
    const html = await requestSeriesText(mangaUrl, context);
    const chapters = parseAstroChapters(stableSlug, html);

    return chapters;
  },

  async getChapterPages(chapterId, context): Promise<SourcePage[]> {
    const chapter = parseChapterReference(chapterId);
    const { comicSlug } = chapter.comicSlug
      ? {
          comicSlug: chapter.comicSlug,
        }
      : await ensureComicSlug(chapter.stableSlug, context);

    try {
      const apiPages = await fetchChapterPagesFromApi(
        comicSlug,
        chapter.chapterNumber,
        context
      );

      if (apiPages.length) {
        return apiPages;
      }
    } catch {
      // Fall through to the HTML reader page and premium fallback.
    }

    const chapterUrl = buildChapterUrl(comicSlug, chapter.chapterNumber);
    const html = await requestText(chapterUrl, context, {
      timeoutMs: SERIES_REQUEST_TIMEOUT_MS,
    });

    const parsed = parsePublicChapterPages(chapterUrl, html);
    if (parsed.pages.length) {
      return parsed.pages.map((page) => ({
        ...page,
        chapterTitle:
          page.chapterTitle ??
          (parsed.chapterNumber !== undefined ? `Chapter ${parsed.chapterNumber}` : undefined),
        chapterNumber: page.chapterNumber ?? parsed.chapterNumber,
      }));
    }

    const fallbackPages = await fetchPremiumChapterPages(
      comicSlug,
      chapter.chapterNumber,
      chapterUrl,
      html,
      context
    );

    return fallbackPages.map((page) => ({
      ...page,
      chapterTitle:
        page.chapterTitle ??
        (chapter.chapterNumber ? `Chapter ${chapter.chapterNumber}` : undefined),
      chapterNumber: page.chapterNumber ?? parseChapterNumber(chapter.chapterNumber),
    }));
  },
};
