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
const READ_COMIC_ONLINE_REMOTE_CONFIG_URL =
  "https://raw.githubusercontent.com/keiyoushi/extensions-source/refs/heads/main/src/en/readcomiconline/config.json";
const ACCEPT_HTML_HEADER =
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

const LIST_ITEM_SELECTOR = ".item-list .section.group.list";
const DESKTOP_LIST_ITEM_SELECTOR = ".list-comic .item";
const CHAPTER_ROW_SELECTOR = "ul.list > li";
const NEXT_PAGE_SELECTOR = "a.next_bt";

const SOURCE_PREFERENCES: { quality: "hq" | "lq"; server: "" | "s2" } = {
  quality: "hq",
  server: "",
};

const USER_AGENT_HEADER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

interface HtmlElement {
  querySelector: (selector: string) => HtmlElement | null;
  querySelectorAll: (selector: string) => Set<HtmlElement>;
  getAttribute: (attributeName: string) => string;
  textContent?: string;
}

interface RemoteConfigDTO {
  imageDecryptEval: string;
  postDecryptEval?: string | null;
  shouldVerifyLinks?: boolean;
}

const asArray = <T>(value: Set<T> | null | undefined): T[] => Array.from(value ?? []);

const cleanText = (value: string | null | undefined): string =>
  (value ?? "").replace(/\s+/g, " ").trim();

const toLower = (value: string | null | undefined): string => cleanText(value).toLowerCase();

const isAbsoluteHttpUrl = (value: string): boolean =>
  value.startsWith("http://") || value.startsWith("https://");

const sanitizeUrlText = (value: string): string =>
  cleanText(value).replace(/[^\x20-\x7E]/g, "");

const isValidHttpUrl = (value: string): boolean => {
  const candidate = sanitizeUrlText(value);
  if (!isAbsoluteHttpUrl(candidate)) {
    return false;
  }

  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

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

const isLikelyChapterUrl = (url: string): boolean => {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(toAbsoluteUrl(url));
    const path = parsed.pathname;
    // ReadComicOnline chapter URLs consistently include the numeric id query param.
    if (!parsed.searchParams.has("id")) {
      return false;
    }

    // Ensure we are below /Comic/<series>/... and not the series root page.
    const segments = path.split("/").filter(Boolean);
    return segments.length >= 3 && segments[0] === "Comic";
  } catch {
    return false;
  }
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
  const mobileEntries = asArray(root.querySelectorAll(LIST_ITEM_SELECTOR));
  const desktopEntries = asArray(root.querySelectorAll(DESKTOP_LIST_ITEM_SELECTOR));
  const entries = [...mobileEntries, ...desktopEntries];

  const items = entries
    .map((entry): SourceManga | null => {
      const infoLink = entry.querySelector(".col.info p a") ?? entry.querySelector("a[href]");
      const desktopTitle = cleanText(entry.querySelector("a span.title")?.textContent);
      const title = cleanText(infoLink?.textContent);
      const resolvedTitle = desktopTitle || title;
      const mangaUrl = toAbsoluteUrl(cleanText(infoLink?.getAttribute("href")));
      const mangaId = toContentId(mangaUrl);

      const coverImage =
        entry.querySelector(".col.cover a img") ??
        entry.querySelector(".col.cover img") ??
        entry.querySelector("a img");
      const cover = toAbsoluteUrl(cleanText(coverImage?.getAttribute("src")));

      if (!resolvedTitle || !mangaUrl || !mangaId) {
        return null;
      }

      return {
        id: mangaId,
        title: resolvedTitle,
        url: mangaUrl,
        thumbnailUrl: cover || undefined,
      };
    })
    .filter((item): item is SourceManga => Boolean(item));

  const pagerLinks = asArray(root.querySelectorAll("ul.pager a"));
  const hasDesktopNextPage = pagerLinks.some((link) => {
    const label = toLower(link.textContent);
    return label.includes("next") || label.includes("›") || label.includes("rsaquo");
  });

  return {
    items: dedupeById(items),
    hasNextPage: root.querySelector(NEXT_PAGE_SELECTOR) !== null || hasDesktopNextPage,
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

      if (!chapterUrl || !chapterId || !isLikelyChapterUrl(chapterUrl)) {
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
      if (!chapterUrl || !chapterId || !isLikelyChapterUrl(chapterUrl)) {
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

let remoteConfigCache: RemoteConfigDTO | null = null;
let remoteConfigLoadedAt = 0;
const REMOTE_CONFIG_TTL_MS = 10 * 60 * 1000;

const extractInlineScripts = (html: string): string[] =>
  Array.from(
    html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi),
    (match) => (match[1] ?? "").trim()
  ).filter(Boolean);

const normalizePageLinks = (value: unknown): string[] => {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
          .map(sanitizeUrlText)
          .filter(isValidHttpUrl);
      }
    } catch {
      return [];
    }
  }

  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
      .map(sanitizeUrlText)
      .filter(isValidHttpUrl);
  }

  return [];
};

const runRemoteDecryptEval = (evalScript: string): unknown => {
  const evaluator = new Function(`return eval(${JSON.stringify(evalScript)});`);
  return evaluator();
};

const decodeImageUrl = (rawPath: string, useSecondServer = false): string | null => {
  try {
    let value = rawPath;

    // Current site scripts replace this token with "e" before decode.
    // Keep legacy variant as a fallback for older pages/mirrors.
    value = value.replace(/fk__RNrv6C_/g, "e");
    value = value.replace(/RN__tgVzmZ_/g, "e");

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

    const host = useSecondServer
      ? "https://img1.whatsnew247.net/pic"
      : "https://2.bp.blogspot.com";
    const serverSuffix = useSecondServer ? "&t=10" : "";

    return `${host}/${path}${queryString}${serverSuffix}`;
  } catch {
    return null;
  }
};

const decodeImageUrlWithFallback = (
  rawPath: string,
  useSecondServer = false
): string | null => {
  const direct = decodeImageUrl(rawPath, useSecondServer);
  if (direct) {
    return direct;
  }

  // Some scripts wrap payloads with short opaque prefixes, then strip them
  // at runtime (e.g., helper functions doing substr(8|13)). Try trimmed forms.
  const value = cleanText(rawPath);
  const maxTrim = Math.min(24, Math.max(0, value.length - 1));
  for (let offset = 1; offset <= maxTrim; offset += 1) {
    const candidate = decodeImageUrl(value.slice(offset), useSecondServer);
    if (candidate) {
      return candidate;
    }
  }

  return null;
};

const decryptPageUrls = (html: string, useSecondServer = false): string[] => {
  const urls: string[] = [];

  // Newer script variants render from a specific runtime queue
  // (e.g. if (currImage < _c5IHGXlCRB.length) { ... _c5IHGXlCRB[currImage] ... }).
  // Prefer extracting only payloads that feed that queue, which avoids
  // promo/interstitial payload arrays injected in the same script block.
  const runtimeQueueNames = Array.from(
    new Set(
      Array.from(
        html.matchAll(/currImage\s*<\s*([A-Za-z_][\w$]*)\.length/g),
        (match) => cleanText(match[1])
      ).filter(Boolean)
    )
  );

  const queueScopedEncodedUrls: string[] = [];
  for (const queueName of runtimeQueueNames) {
    const queuePushPattern = new RegExp(
      `\\b${escapeRegExp(queueName)}\\s*\\.push\\(\\s*['"]([^'"]+)['"]\\s*\\)`,
      "g"
    );
    for (const match of html.matchAll(queuePushPattern)) {
      if (match[1]) {
        queueScopedEncodedUrls.push(match[1]);
      }
    }

    const queueHelperCallPattern = new RegExp(
      `\\b[A-Za-z_][\\w$]*\\([^\\n\\r]*\\b${escapeRegExp(
        queueName
      )}\\b[^\\n\\r]*['"]([^'"]*(?:=s0\\?|=s1600\\?|\\?ipx=2)[^'"]*)['"][^\\n\\r]*\\)`,
      "g"
    );
    for (const match of html.matchAll(queueHelperCallPattern)) {
      if (match[1]) {
        queueScopedEncodedUrls.push(match[1]);
      }
    }
  }

  if (queueScopedEncodedUrls.length > 0) {
    for (const encodedUrl of queueScopedEncodedUrls) {
      const decoded = decodeImageUrlWithFallback(encodedUrl, useSecondServer);
      if (decoded) {
        urls.push(decoded);
      }
    }
  }

  const variableMatch = html.match(/var\s+(_[^\s=]+mvn)\s*(?:=\s*[^;]+)?\s*;/);
  if (urls.length === 0 && variableMatch) {
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

      const decoded = decodeImageUrlWithFallback(encodedUrl, useSecondServer);
      if (decoded) {
        urls.push(decoded);
      }
    }
  } else if (urls.length === 0) {
    const fallbackPattern = /pth\s*=\s*'([^']+\?rhlupa=[^']+)'/g;
    for (const match of html.matchAll(fallbackPattern)) {
      const encodedUrl = match[1];
      if (!encodedUrl) {
        continue;
      }

      const decoded = decodeImageUrlWithFallback(encodedUrl, useSecondServer);
      if (decoded) {
        urls.push(decoded);
      }
    }
  }

  // Modern obfuscated pages often push encrypted image payloads to
  // dynamically named arrays (e.g. _areyouf.push(...)) without using
  // the legacy mvn variable naming scheme. Capture those too.
  if (urls.length === 0) {
    const genericPushPattern =
      /\.push\(\s*['"]([^'"]*(?:=s0\?|=s1600\?|\?ipx=2)[^'"]*)['"]\s*\)/g;
    for (const match of html.matchAll(genericPushPattern)) {
      const encodedUrl = match[1];
      if (!encodedUrl) {
        continue;
      }

      const decoded = decodeImageUrlWithFallback(encodedUrl, useSecondServer);
      if (decoded) {
        urls.push(decoded);
      }
    }
  }

  // Newer script variants often pass encrypted payloads into helper functions
  // that later push/transform into the real page queue. Capture string args.
  if (urls.length === 0) {
    const helperCallPayloadPattern =
      /\b[A-Za-z_][\w$]*\([^()\n\r]*['"]([^'"]*(?:=s0\?|=s1600\?|\?ipx=2)[^'"]*)['"][^()\n\r]*\)/g;
    for (const match of html.matchAll(helperCallPayloadPattern)) {
      const encodedUrl = match[1];
      if (!encodedUrl) {
        continue;
      }

      const decoded = decodeImageUrlWithFallback(encodedUrl, useSecondServer);
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

const requestRemoteConfig = async (context: SourceAdapterContext): Promise<RemoteConfigDTO | null> => {
  const now = Date.now();
  if (remoteConfigCache && now - remoteConfigLoadedAt < REMOTE_CONFIG_TTL_MS) {
    return remoteConfigCache;
  }

  try {
    const cacheBustedUrl = `${READ_COMIC_ONLINE_REMOTE_CONFIG_URL}?bust=${now}`;
    const response = await context.http.get<string>(cacheBustedUrl, {
      responseType: "text",
      headers: {
        Accept: "application/json,text/plain,*/*",
        "User-Agent": USER_AGENT_HEADER,
      },
    });

    const payload = typeof response.data === "string"
      ? response.data
      : String(response.data ?? "");
    const parsed = JSON.parse(payload) as RemoteConfigDTO;
    if (!parsed?.imageDecryptEval) {
      return null;
    }

    remoteConfigCache = parsed;
    remoteConfigLoadedAt = now;
    return parsed;
  } catch {
    return null;
  }
};

const decryptPageUrlsWithRemoteConfig = (
  html: string,
  remoteConfig: RemoteConfigDTO,
  useSecondServer: boolean
): string[] => {
  const scripts = extractInlineScripts(html);
  if (scripts.length === 0) {
    return [];
  }

  let decryptedLinks: string[] = [];
  for (const scriptContent of scripts) {
    try {
      const evalScript =
        `let _encryptedString = ${JSON.stringify(scriptContent)};` +
        `let _useServer2 = ${useSecondServer};` +
        remoteConfig.imageDecryptEval;
      const evalResult = runRemoteDecryptEval(evalScript);
      decryptedLinks.push(...normalizePageLinks(evalResult));
    } catch {
      // Continue scanning other script blocks.
    }
  }

  if (remoteConfig.postDecryptEval) {
    try {
      const postEvalScript =
        `let _decryptedLinks = ${JSON.stringify(decryptedLinks)};` +
        `let _useServer2 = ${useSecondServer};` +
        remoteConfig.postDecryptEval;
      const postEvalResult = runRemoteDecryptEval(postEvalScript);
      const normalized = normalizePageLinks(postEvalResult);
      if (normalized.length > 0) {
        decryptedLinks = normalized;
      }
    } catch {
      // Keep decryptedLinks from first pass.
    }
  }

  const deduped = new Set<string>();
  const ordered: string[] = [];
  for (const link of decryptedLinks) {
    const trimmed = sanitizeUrlText(link);
    if (!trimmed || deduped.has(trimmed)) {
      continue;
    }
    if (!isValidHttpUrl(trimmed)) {
      continue;
    }
    deduped.add(trimmed);
    ordered.push(trimmed);
  }

  return ordered;
};

const verifyRemoteLinks = async (
  links: string[],
  context: SourceAdapterContext
): Promise<string[]> => {
  const verified: string[] = [];
  for (const link of links) {
    try {
      const response = await context.http.get<ArrayBuffer>(link, {
        responseType: "arraybuffer",
        timeoutMs: 10000,
        headers: {
          "User-Agent": USER_AGENT_HEADER,
          Referer: `${READ_COMIC_ONLINE_BASE_URL}/`,
          Range: "bytes=0-0",
        },
      });
      if (response.status >= 200 && response.status < 300) {
        verified.push(link);
      }
    } catch {
      // Drop broken link.
    }
  }
  return verified;
};

const parseChapterPages = async (
  chapterUrl: string,
  html: string,
  context: SourceAdapterContext,
  useSecondServer = false
): Promise<SourcePage[]> => {
  const remoteConfig = await requestRemoteConfig(context);
  const remoteDecodedUrls =
    remoteConfig
      ? decryptPageUrlsWithRemoteConfig(html, remoteConfig, useSecondServer)
      : [];
  const remoteLinks =
    remoteConfig?.shouldVerifyLinks
      ? await verifyRemoteLinks(remoteDecodedUrls, context)
      : remoteDecodedUrls;
  const imageUrls =
    remoteLinks.length > 0
      ? remoteLinks
      : decryptPageUrls(html, useSecondServer);

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
  const chapterHost = (() => {
    try {
      return new URL(chapterUrl).host;
    } catch {
      return "";
    }
  })();

  return imageUrls.map((imageUrl, index) => {
    const headers: Record<string, string> = {
      Referer: chapterUrl,
      "User-Agent": USER_AGENT_HEADER,
    };

    const imageHost = (() => {
      try {
        return new URL(imageUrl).host;
      } catch {
        return "";
      }
    })();

    // Only attach source cookies when requesting same-host assets.
    if (cookieHeader && imageHost === chapterHost) {
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

const isPageReachable = async (
  page: SourcePage | undefined,
  context: SourceAdapterContext
): Promise<boolean> => {
  if (!page?.imageUrl) {
    return false;
  }

  try {
    const response = await context.http.get<ArrayBuffer>(page.imageUrl, {
      responseType: "arraybuffer",
      timeoutMs: 12000,
      headers: {
        ...page.headers,
        Range: "bytes=0-0",
      },
    });

    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  }
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
  const requestedServer = SOURCE_PREFERENCES.server;
  const includeQuality =
    (SOURCE_PREFERENCES.quality !== "lq" && requestedServer !== "s2") ||
    (SOURCE_PREFERENCES.quality === "lq" && requestedServer === "s2");
  const separator = chapterUrl.includes("?") ? "&" : "?";

  if (!includeQuality) {
    return `${chapterUrl}${separator}s=${requestedServer}&readType=1`;
  }

  return `${chapterUrl}${separator}s=${requestedServer}&quality=${SOURCE_PREFERENCES.quality}&readType=1`;
};

const buildChapterReadUrlWithServer = (chapterUrl: string, server: "" | "s2"): string => {
  const includeQuality =
    (SOURCE_PREFERENCES.quality !== "lq" && server !== "s2") ||
    (SOURCE_PREFERENCES.quality === "lq" && server === "s2");
  const separator = chapterUrl.includes("?") ? "&" : "?";

  if (!includeQuality) {
    return `${chapterUrl}${separator}s=${server}&readType=1`;
  }

  return `${chapterUrl}${separator}s=${server}&quality=${SOURCE_PREFERENCES.quality}&readType=1`;
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
    const primaryPages = await parseChapterPages(chapterUrl, html, context, false);

    const primaryReachable = await isPageReachable(primaryPages[0], context);
    if (primaryReachable) {
      return primaryPages;
    }

    // Retry using server 2 decoding style used by RCO's fallback path.
    const fallbackHtml = await requestText(buildChapterReadUrlWithServer(chapterUrl, "s2"), context);
    const fallbackPages = await parseChapterPages(chapterUrl, fallbackHtml, context, true);
    const fallbackReachable = await isPageReachable(fallbackPages[0], context);
    if (fallbackReachable) {
      return fallbackPages;
    }

    return primaryPages;
  },
};
