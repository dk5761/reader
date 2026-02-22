import { getCookieHeaderForUrl } from "@/services/cookies/cookieStore";
import IDOMParser from "advanced-html-parser";
import type {
  SourceAdapter,
  SourceAdapterContext,
  SourceChapter,
  SourceManga,
  SourceMangaDetails,
  SourcePage,
} from "../../core";

// ─── Constants ────────────────────────────────────────────────────────────────

const READ_COMIC_ONLINE_SOURCE_ID = "readcomiconline";
const READ_COMIC_ONLINE_BASE_URL = "https://readcomiconline.li";
const READ_COMIC_ONLINE_REMOTE_CONFIG_URL =
  "https://raw.githubusercontent.com/keiyoushi/extensions-source/refs/heads/main/src/en/readcomiconline/config.json";
const ACCEPT_HTML_HEADER =
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const USER_AGENT_HEADER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const CAPTCHA_PATH = "/Special/AreYouHuman";

// ── Selectors ─────────────────────────────────────────────────────────────────

const LIST_ITEM_SELECTOR = ".item-list .section.group.list";
const DESKTOP_LIST_ITEM_SELECTOR = ".list-comic .item";

/**
 * FIX: Was "ul.list > li" — the site uses table.listing.
 * Matches Kotlin extension: "table.listing tr:gt(1)"
 * We slice(2) in parseChapters to skip the two header rows.
 */
const CHAPTER_ROW_SELECTOR = "table.listing tr";

const NEXT_PAGE_SELECTOR = "a.next_bt";

// ── Preferences ───────────────────────────────────────────────────────────────

const SOURCE_PREFERENCES: { quality: "hq" | "lq"; server: "" | "s2" } = {
  quality: "hq",
  server: "",
};

// ── Types ─────────────────────────────────────────────────────────────────────

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

/**
 * Error thrown when the site redirects to a captcha page.
 * Consumers should catch this and show a WebView to let the user solve it,
 * then retry the original request once cookies have been set.
 */
export class CaptchaRequiredError extends Error {
  constructor(public readonly captchaUrl: string) {
    super(`Captcha required: ${captchaUrl}`);
    this.name = "CaptchaRequiredError";
  }
}

// ─── JS Sandbox ───────────────────────────────────────────────────────────────

/**
 * In React Native we cannot safely use `new Function` / `eval` — Apple's App
 * Store guidelines and iOS's JIT restrictions both make this unreliable.
 *
 * The recommended solution is to route JS evaluation through a hidden WKWebView
 * (react-native-webview).  This module exposes a singleton `jsSandbox` that
 * your app must wire up by:
 *
 *   1. Rendering <JsSandboxView /> once at the root of your app.
 *   2. Calling jsSandbox.setRef(ref) from that component.
 *
 * Until a ref is set every evaluation will throw, which causes the adapter to
 * fall back to the local regex-based decoder (decryptPageUrlsFallback).
 */
type SandboxResolver = (value: string) => void;
type SandboxRejecter = (reason: unknown) => void;

class JsSandbox {
  // The WebView ref is set by the companion <JsSandboxView /> component.
  private webViewRef: {
    current: { injectJavaScript: (s: string) => void } | null;
  } | null = null;
  private pending = new Map<
    string,
    { resolve: SandboxResolver; reject: SandboxRejecter }
  >();

  setRef(ref: { current: { injectJavaScript: (s: string) => void } | null }) {
    this.webViewRef = ref;
  }

  /** Evaluate `script` inside the sandboxed WebView and return the result. */
  evaluate(script: string, timeoutMs = 10_000): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.webViewRef?.current) {
        reject(new Error("JsSandbox WebView ref is not set"));
        return;
      }

      const id = Math.random().toString(36).slice(2);
      this.pending.set(id, { resolve, reject });

      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("JsSandbox evaluation timed out"));
        }
      }, timeoutMs);

      const wrapped = `
        (function() {
          try {
            const __result = (function() { ${script} })();
            window.ReactNativeWebView.postMessage(
              JSON.stringify({ id: ${JSON.stringify(id)}, result: __result })
            );
          } catch (__e) {
            window.ReactNativeWebView.postMessage(
              JSON.stringify({ id: ${JSON.stringify(id)}, error: String(__e) })
            );
          }
        })();
        true;
      `;

      this.webViewRef.current.injectJavaScript(wrapped);

      // Keep the timer reference so we can clear it on resolution.
      const originalResolve = resolve;
      const originalReject = reject;
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          originalResolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          originalReject(e);
        },
      });
    });
  }

  /**
   * Call this from the WebView's onMessage handler:
   *   <WebView onMessage={(e) => jsSandbox.handleMessage(e.nativeEvent.data)} />
   */
  handleMessage(data: string) {
    try {
      const parsed = JSON.parse(data) as {
        id: string;
        result?: string;
        error?: string;
      };
      const entry = this.pending.get(parsed.id);
      if (!entry) return;
      this.pending.delete(parsed.id);
      if (parsed.error) {
        entry.reject(new Error(parsed.error));
      } else {
        entry.resolve(parsed.result ?? "");
      }
    } catch {
      // Ignore messages not intended for us.
    }
  }
}

export const jsSandbox = new JsSandbox();

// ─── Utility helpers ──────────────────────────────────────────────────────────

const asArray = <T>(value: Set<T> | null | undefined): T[] =>
  Array.from(value ?? []);

const cleanText = (value: string | null | undefined): string =>
  (value ?? "").replace(/\s+/g, " ").trim();

const toLower = (value: string | null | undefined): string =>
  cleanText(value).toLowerCase();

const isAbsoluteHttpUrl = (value: string): boolean =>
  value.startsWith("http://") || value.startsWith("https://");

const sanitizeUrlText = (value: string): string =>
  cleanText(value).replace(/[^\x20-\x7E]/g, "");

const isValidHttpUrl = (value: string): boolean => {
  const candidate = sanitizeUrlText(value);
  if (!isAbsoluteHttpUrl(candidate)) return false;
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
  if (!value) return "";
  if (value.startsWith("//")) return `https:${value}`;
  if (isAbsoluteHttpUrl(value)) return value;
  if (value.startsWith("/")) return `${READ_COMIC_ONLINE_BASE_URL}${value}`;
  return `${READ_COMIC_ONLINE_BASE_URL}/${value}`;
};

const toPathWithQuery = (pathOrUrl: string): string => {
  const value = cleanText(pathOrUrl);
  if (!value) return "";
  if (isAbsoluteHttpUrl(value)) {
    try {
      const parsed = new URL(value);
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return value;
    }
  }
  if (value.startsWith("/")) return value;
  return `/${value}`;
};

const toContentId = (pathOrUrl: string): string => {
  const absolute = toAbsoluteUrl(pathOrUrl);
  if (!absolute) return "";
  try {
    const parsed = new URL(absolute);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "";
  }
};

const parseStatus = (value: string): SourceMangaDetails["status"] => {
  const n = toLower(value);
  if (n.includes("ongoing")) return "ongoing";
  if (n.includes("completed")) return "completed";
  if (n.includes("hiatus") || n.includes("on hold")) return "hiatus";
  if (n.includes("cancelled") || n.includes("dropped")) return "cancelled";
  return "unknown";
};

const parseChapterNumber = (title: string): number | undefined => {
  const match = cleanText(title).match(/([+-]?(?:[0-9]*[.])?[0-9]+)/);
  if (!match) return undefined;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const isLikelyChapterUrl = (url: string): boolean => {
  if (!url) return false;
  try {
    const parsed = new URL(toAbsoluteUrl(url));
    if (!parsed.searchParams.has("id")) return false;
    const segments = parsed.pathname.split("/").filter(Boolean);
    return segments.length >= 3 && segments[0] === "Comic";
  } catch {
    return false;
  }
};

const dedupeById = <T extends { id: string }>(items: T[]): T[] => {
  const map = new Map<string, T>();
  items.forEach((item) => {
    if (item.id && !map.has(item.id)) map.set(item.id, item);
  });
  return Array.from(map.values());
};

// ─── HTML parsers ─────────────────────────────────────────────────────────────

const parseListing = (
  html: string,
): { items: SourceManga[]; hasNextPage: boolean } => {
  const root = parseHtmlRoot(html);
  const mobileEntries = asArray(root.querySelectorAll(LIST_ITEM_SELECTOR));
  const desktopEntries = asArray(
    root.querySelectorAll(DESKTOP_LIST_ITEM_SELECTOR),
  );
  const entries = [...mobileEntries, ...desktopEntries];

  const items = entries
    .map((entry): SourceManga | null => {
      const infoLink =
        entry.querySelector(".col.info p a") ?? entry.querySelector("a[href]");
      const desktopTitle = cleanText(
        entry.querySelector("a span.title")?.textContent,
      );
      const title = cleanText(infoLink?.textContent);
      const resolvedTitle = desktopTitle || title;
      const mangaUrl = toAbsoluteUrl(cleanText(infoLink?.getAttribute("href")));
      const mangaId = toContentId(mangaUrl);
      const coverImage =
        entry.querySelector(".col.cover a img") ??
        entry.querySelector(".col.cover img") ??
        entry.querySelector("a img");
      const cover = toAbsoluteUrl(cleanText(coverImage?.getAttribute("src")));
      if (!resolvedTitle || !mangaUrl || !mangaId) return null;
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
    return (
      label.includes("next") || label.includes("›") || label.includes("rsaquo")
    );
  });

  return {
    items: dedupeById(items),
    hasNextPage:
      root.querySelector(NEXT_PAGE_SELECTOR) !== null || hasDesktopNextPage,
  };
};

const extractInfoValueByLabel = (
  paragraphs: HtmlElement[],
  label: string,
): string | undefined => {
  const normalizedLabel = toLower(label);
  for (const paragraph of paragraphs) {
    const text = cleanText(paragraph.textContent);
    if (!toLower(text).includes(normalizedLabel)) continue;
    const linkedValues = asArray(paragraph.querySelectorAll("a"))
      .map((entry) => cleanText(entry.textContent))
      .filter(Boolean);
    if (linkedValues.length > 0) return linkedValues.join(", ");
    const colonIndex = text.indexOf(":");
    if (colonIndex >= 0)
      return cleanText(text.slice(colonIndex + 1)) || undefined;
    return text || undefined;
  }
  return undefined;
};

const extractGenres = (paragraphs: HtmlElement[]): string[] => {
  for (const paragraph of paragraphs) {
    const text = cleanText(paragraph.textContent);
    if (!toLower(text).includes("genres")) continue;
    const genres = asArray(paragraph.querySelectorAll("a"))
      .map((entry) => cleanText(entry.textContent))
      .filter(Boolean);
    if (genres.length > 0) return genres;
    const colonIndex = text.indexOf(":");
    if (colonIndex < 0) return [];
    return text
      .slice(colonIndex + 1)
      .split(",")
      .map(cleanText)
      .filter(Boolean);
  }
  return [];
};

const extractTitleFromHtmlHead = (html: string): string | undefined => {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch?.[1]) return undefined;
  const normalized = cleanText(titleMatch[1]);
  if (!normalized) return undefined;
  const chunks = normalized
    .split(/\s+comic\s*\|\s*read\s+/i)
    .map(cleanText)
    .filter(Boolean);
  if (chunks.length > 0) return chunks[0];
  return normalized;
};

const parseMangaDetails = (
  mangaUrl: string,
  html: string,
): SourceMangaDetails => {
  const root = parseHtmlRoot(html);
  const title =
    cleanText(root.querySelector(".barContent a.bigChar")?.textContent) ||
    cleanText(root.querySelector(".content_top .heading h3")?.textContent) ||
    cleanText(
      root.querySelector(".bigBarContainer .barTitle")?.textContent,
    ).replace(/\s+information$/i, "") ||
    extractTitleFromHtmlHead(html) ||
    cleanText(
      root.querySelector("meta[property='og:title']")?.getAttribute("content"),
    );

  const cover = toAbsoluteUrl(
    cleanText(
      root
        .querySelector("#rightside .rightBox .barContent img")
        ?.getAttribute("src") ||
        root.querySelector(".rightBox .barContent img")?.getAttribute("src") ||
        root.querySelector(".col.cover img")?.getAttribute("src"),
    ),
  );

  const infoParagraphs = [
    ...asArray(root.querySelectorAll(".bigBarContainer .barContent p")),
    ...asArray(root.querySelectorAll(".col.info p")),
  ];

  const author = extractInfoValueByLabel(infoParagraphs, "writer");
  const artist = extractInfoValueByLabel(infoParagraphs, "artist");
  const statusValue = extractInfoValueByLabel(infoParagraphs, "status") ?? "";
  const genres = extractGenres(infoParagraphs);

  const descriptionCandidates = [
    ...asArray(root.querySelectorAll(".bigBarContainer .barContent p")),
    ...asArray(root.querySelectorAll(".section.group p")),
  ]
    .map((entry) => cleanText(entry.textContent))
    .filter((entry) => {
      if (!entry) return false;
      const lowered = toLower(entry);
      return !(
        lowered.startsWith("genres:") ||
        lowered.startsWith("publisher:") ||
        lowered.startsWith("writer:") ||
        lowered.startsWith("artist:") ||
        lowered.startsWith("publication date:") ||
        lowered.startsWith("status:")
      );
    });

  const description =
    descriptionCandidates.find((entry) => entry.length > 120) ||
    descriptionCandidates.find(
      (entry) => !entry.includes(":") && entry.length > 50,
    ) ||
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

  /**
   * FIX: Use "table.listing tr" and slice off the first 2 header rows,
   * matching the Kotlin extension's "table.listing tr:gt(1)".
   */
  const allRows = asArray(root.querySelectorAll(CHAPTER_ROW_SELECTOR));
  const chapterRows = allRows.slice(2);

  const chapters = chapterRows
    .map((row): SourceChapter | null => {
      const linkElement =
        row.querySelector("td a") ?? row.querySelector("a[href]");
      const chapterUrl = toAbsoluteUrl(
        cleanText(linkElement?.getAttribute("href")),
      );
      const chapterId = toContentId(chapterUrl);
      const titleFromSpan = cleanText(
        linkElement?.querySelector("span")?.textContent,
      );
      const chapterTitle = titleFromSpan || cleanText(linkElement?.textContent);
      // The date is in the second <td>
      const chapterDate = cleanText(
        row.querySelector("td:nth-child(2)")?.textContent,
      );

      if (!chapterUrl || !chapterId || !isLikelyChapterUrl(chapterUrl))
        return null;

      return {
        id: chapterId,
        title:
          chapterTitle ||
          `Chapter ${chapterId.split("/").filter(Boolean).pop() ?? ""}`,
        url: chapterUrl,
        number: parseChapterNumber(chapterTitle),
        uploadedAt: chapterDate || undefined,
      };
    })
    .filter((chapter): chapter is SourceChapter => Boolean(chapter));

  const deduped = dedupeById(chapters);
  if (deduped.length > 0) return deduped;

  // Broad fallback — scan any comic link on the page.
  return asArray(root.querySelectorAll("a[href*='/Comic/']"))
    .map((entry): SourceChapter | null => {
      const chapterUrl = toAbsoluteUrl(cleanText(entry.getAttribute("href")));
      const chapterId = toContentId(chapterUrl);
      const chapterTitle = cleanText(entry.textContent);
      if (!chapterUrl || !chapterId || !isLikelyChapterUrl(chapterUrl))
        return null;
      return {
        id: chapterId,
        title:
          chapterTitle ||
          `Chapter ${chapterId.split("/").filter(Boolean).pop() ?? ""}`,
        url: chapterUrl,
        number: parseChapterNumber(chapterTitle),
      };
    })
    .filter((chapter): chapter is SourceChapter => Boolean(chapter));
};

// ─── Remote config ────────────────────────────────────────────────────────────

let remoteConfigCache: RemoteConfigDTO | null = null;
let remoteConfigLoadedAt = 0;
const REMOTE_CONFIG_TTL_MS = 10 * 60 * 1000;

const requestRemoteConfig = async (
  context: SourceAdapterContext,
): Promise<RemoteConfigDTO | null> => {
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
    const payload =
      typeof response.data === "string"
        ? response.data
        : String(response.data ?? "");
    const parsed = JSON.parse(payload) as RemoteConfigDTO;
    if (!parsed?.imageDecryptEval) return null;
    remoteConfigCache = parsed;
    remoteConfigLoadedAt = now;
    return parsed;
  } catch {
    return null;
  }
};

// ─── Image URL decoding ───────────────────────────────────────────────────────

const extractInlineScripts = (html: string): string[] =>
  Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi), (match) =>
    (match[1] ?? "").trim(),
  ).filter(Boolean);

const normalizePageLinks = (value: unknown): string[] => {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .filter(
            (entry): entry is string =>
              typeof entry === "string" && entry.length > 0,
          )
          .map(sanitizeUrlText)
          .filter(isValidHttpUrl);
      }
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) {
    return value
      .filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.length > 0,
      )
      .map(sanitizeUrlText)
      .filter(isValidHttpUrl);
  }
  return [];
};

/**
 * Evaluate the remote config script safely.
 *
 * Strategy:
 *   1. Try the JsSandbox (hidden WebView) — safest for iOS.
 *   2. Fall back to `new Function` if the sandbox isn't wired up yet
 *      (e.g. during unit tests or early startup).
 */
const runRemoteDecryptEval = async (evalScript: string): Promise<unknown> => {
  // Attempt 1: WebView sandbox
  try {
    const raw = await jsSandbox.evaluate(
      `return (function(){ ${evalScript} })()`,
    );
    return JSON.parse(raw);
  } catch {
    // Sandbox not ready or timed out — fall through.
  }

  // Attempt 2: new Function (dev / test only — may be blocked on iOS in production)
  try {
    const evaluator = new Function(`return (function(){ ${evalScript} })()`);
    return evaluator();
  } catch {
    return null;
  }
};

const decodeBase64Binary = (value: string): string => {
  if (typeof globalThis.atob === "function") return globalThis.atob(value);
  // React Native doesn't have atob globally in all versions — use Buffer as fallback.
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64").toString("binary");
  }
  throw new Error("No base64 decoder available.");
};

const decodeBase64Utf8 = (value: string): string => {
  const binary = decodeBase64Binary(value);
  let percentEncoded = "";
  for (let i = 0; i < binary.length; i += 1) {
    const hex = binary.charCodeAt(i).toString(16).padStart(2, "0");
    percentEncoded += `%${hex}`;
  }
  return decodeURIComponent(percentEncoded);
};

/**
 * Decode a single obfuscated image path into a full CDN URL.
 *
 * FIX: Added "v6__7zK980_" → "e" substitution (current obfuscation token
 * seen in the wild).  The two older tokens are kept for backward compat.
 */
const decodeImageUrl = (
  rawPath: string,
  useSecondServer = false,
): string | null => {
  try {
    let value = rawPath;

    // ── Obfuscation token substitutions ──────────────────────────────────────
    // Current token observed in live HTML (was missing before):
    value = value.replace(/v6__7zK980_/g, "e");
    // Older tokens kept for backward compatibility:
    value = value.replace(/fk__RNrv6C_/g, "e");
    value = value.replace(/RN__tgVzmZ_/g, "e");

    // Character swap obfuscation (b ↔ h via intermediate tokens):
    value = value.replace(/b/g, "pw_.g28x");
    value = value.replace(/h/g, "d2pr.x_27");
    value = value.replace(/pw_.g28x/g, "b");
    value = value.replace(/d2pr.x_27/g, "h");

    if (value.startsWith("https")) return value;

    const queryIndex = value.indexOf("?");
    if (queryIndex < 0) return null;
    const queryString = value.substring(queryIndex);

    const isLowQuality = value.includes("=s0?");
    const sizeMarker = isLowQuality ? "=s0?" : "=s1600?";
    const sizeIndex = value.indexOf(sizeMarker);
    if (sizeIndex < 0) return null;

    let transformed = value.substring(0, sizeIndex);
    if (transformed.length < 50) return null;

    transformed = transformed.substring(15, 33) + transformed.substring(50);
    if (transformed.length < 2) return null;

    const trimmedLength = Math.max(transformed.length - 11, 0);
    transformed =
      transformed.substring(0, trimmedLength) + transformed.slice(-2);

    const decoded = decodeBase64Utf8(transformed);
    if (decoded.length < 17) return null;

    let path = decoded.substring(0, 13) + decoded.substring(17);
    if (path.length < 2) return null;
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
  useSecondServer = false,
): string | null => {
  const direct = decodeImageUrl(rawPath, useSecondServer);
  if (direct) return direct;

  const value = cleanText(rawPath);
  const maxTrim = Math.min(24, Math.max(0, value.length - 1));
  for (let offset = 1; offset <= maxTrim; offset += 1) {
    const candidate = decodeImageUrl(value.slice(offset), useSecondServer);
    if (candidate) return candidate;
  }
  return null;
};

/**
 * Local regex-based fallback decoder used when the remote config is unavailable.
 *
 * FIX 1: Explicitly handles dTfnT() calls, stripping the 11-char prefix
 *         ("YOySqLSdVCL") that the site inserts as anti-scraping noise —
 *         matching exactly what dTfnT does: z.substr(11, z.length - 11).
 *
 * FIX 2: The v6__7zK980_ token is now handled inside decodeImageUrl (above).
 */
const decryptPageUrlsFallback = (
  html: string,
  useSecondServer = false,
): string[] => {
  const encodedCandidates: string[] = [];

  // ── Strategy 1: dTfnT() helper calls (primary image list builder) ─────────
  // dTfnT strips the first 11 chars from its last argument before pushing to
  // _ml3OaoDIiL, so we replicate that here.
  const dTfnTPattern = /dTfnT\s*\([^)]*,\s*['"]([^'"]{20,})['"]\s*\)/g;
  for (const match of html.matchAll(dTfnTPattern)) {
    if (match[1]) {
      encodedCandidates.push(match[1].substring(11)); // strip "YOySqLSdVCL" prefix
    }
  }

  // ── Strategy 2: Generic .push() calls containing encoded image markers ────
  const pushPattern =
    /\b[A-Za-z_][\w$]*\s*\.push\(\s*['"]([^'"]*(?:=s0\?|=s1600\?|\?ipx=2)[^'"]*)['"]\s*\)/g;
  for (const match of html.matchAll(pushPattern)) {
    if (match[1]) encodedCandidates.push(match[1]);
  }

  // ── Strategy 3: Generic helper call arguments ──────────────────────────────
  const helperCallPattern =
    /\b[A-Za-z_][\w$]*\([^()\n\r]*['"]([^'"]*(?:=s0\?|=s1600\?|\?ipx=2)[^'"]*)['"][^()\n\r]*\)/g;
  for (const match of html.matchAll(helperCallPattern)) {
    if (match[1]) encodedCandidates.push(match[1]);
  }

  // ── Decode and dedupe ──────────────────────────────────────────────────────
  const deduped = new Set<string>();
  const decodedUrls: string[] = [];

  for (const encoded of encodedCandidates) {
    const decoded = decodeImageUrlWithFallback(encoded, useSecondServer);
    if (!decoded) continue;
    const sanitized = sanitizeUrlText(decoded);
    if (!isValidHttpUrl(sanitized) || deduped.has(sanitized)) continue;
    deduped.add(sanitized);
    decodedUrls.push(sanitized);
  }

  return decodedUrls;
};

const decryptPageUrlsWithRemoteConfig = async (
  html: string,
  remoteConfig: RemoteConfigDTO,
  useSecondServer: boolean,
): Promise<string[]> => {
  const scripts = extractInlineScripts(html);
  if (scripts.length === 0) return [];

  let decryptedLinks: string[] = [];

  for (const scriptContent of scripts) {
    try {
      const evalScript =
        `let _encryptedString = ${JSON.stringify(scriptContent)};` +
        `let _useServer2 = ${useSecondServer};` +
        remoteConfig.imageDecryptEval;
      const evalResult = await runRemoteDecryptEval(evalScript);
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
      const postEvalResult = await runRemoteDecryptEval(postEvalScript);
      const normalized = normalizePageLinks(postEvalResult);
      if (normalized.length > 0) decryptedLinks = normalized;
    } catch {
      // Keep decryptedLinks from first pass.
    }
  }

  const deduped = new Set<string>();
  const ordered: string[] = [];
  for (const link of decryptedLinks) {
    const trimmed = sanitizeUrlText(link);
    if (!trimmed || deduped.has(trimmed) || !isValidHttpUrl(trimmed)) continue;
    deduped.add(trimmed);
    ordered.push(trimmed);
  }

  return ordered;
};

const verifyRemoteLinks = async (
  links: string[],
  context: SourceAdapterContext,
): Promise<string[]> => {
  const verified: string[] = [];
  for (const link of links) {
    try {
      const response = await context.http.get<ArrayBuffer>(link, {
        responseType: "arraybuffer",
        timeoutMs: 10_000,
        headers: {
          "User-Agent": USER_AGENT_HEADER,
          Referer: `${READ_COMIC_ONLINE_BASE_URL}/`,
          Range: "bytes=0-0",
        },
      });
      if (response.status >= 200 && response.status < 300) verified.push(link);
    } catch {
      // Drop broken link.
    }
  }
  return verified;
};

// ─── Chapter page parser ──────────────────────────────────────────────────────

const parseChapterPages = async (
  chapterUrl: string,
  html: string,
  context: SourceAdapterContext,
  useSecondServer = false,
): Promise<SourcePage[]> => {
  const remoteConfig = await requestRemoteConfig(context);

  const remoteDecodedUrls = remoteConfig
    ? await decryptPageUrlsWithRemoteConfig(html, remoteConfig, useSecondServer)
    : [];

  const remoteLinks = remoteConfig?.shouldVerifyLinks
    ? await verifyRemoteLinks(remoteDecodedUrls, context)
    : remoteDecodedUrls;

  const imageUrls =
    remoteLinks.length > 0
      ? remoteLinks
      : decryptPageUrlsFallback(html, useSecondServer);

  // Extract chapter title/number from the <title> tag.
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  let chapterTitle: string | undefined;
  let chapterNumber: number | undefined;
  if (titleMatch) {
    chapterTitle = cleanText(titleMatch[1]);
    const numMatch = chapterTitle.match(/(?:chapter\s*)?([+-]?(?:\d*\.)?\d+)/i);
    if (numMatch) chapterNumber = parseFloat(numMatch[1]);
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
    if (cookieHeader && imageHost === chapterHost)
      headers.Cookie = cookieHeader;

    return { index, imageUrl, headers, chapterTitle, chapterNumber };
  });
};

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

/**
 * Fetch a URL as text, throwing CaptchaRequiredError if the site redirects
 * to its human-verification page.
 */
const requestText = async (
  url: string,
  context: SourceAdapterContext,
): Promise<string> => {
  const response = await context.http.get<string>(url, {
    responseType: "text",
    headers: {
      Accept: ACCEPT_HTML_HEADER,
      "User-Agent": USER_AGENT_HEADER,
      Referer: `${READ_COMIC_ONLINE_BASE_URL}/`,
    },
  });

  // Detect captcha redirect — either via a Location header or by inspecting
  // the final URL after following redirects (if the HTTP client exposes it).
  const finalUrl: string | undefined =
    (response as unknown as { finalUrl?: string }).finalUrl ?? url;
  if (finalUrl.includes(CAPTCHA_PATH)) {
    throw new CaptchaRequiredError(finalUrl);
  }

  return typeof response.data === "string"
    ? response.data
    : String(response.data ?? "");
};

// ─── URL builders ─────────────────────────────────────────────────────────────

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

const buildChapterReadUrl = (
  chapterUrl: string,
  server: "" | "s2" = SOURCE_PREFERENCES.server,
): string => {
  const includeQuality =
    (SOURCE_PREFERENCES.quality !== "lq" && server !== "s2") ||
    (SOURCE_PREFERENCES.quality === "lq" && server === "s2");
  const separator = chapterUrl.includes("?") ? "&" : "?";
  if (!includeQuality) return `${chapterUrl}${separator}s=${server}&readType=1`;
  return `${chapterUrl}${separator}s=${server}&quality=${SOURCE_PREFERENCES.quality}&readType=1`;
};

const resolveMangaUrl = (mangaIdOrUrl: string): string =>
  toAbsoluteUrl(toPathWithQuery(mangaIdOrUrl));

const resolveChapterUrl = (chapterIdOrUrl: string): string =>
  toAbsoluteUrl(toPathWithQuery(chapterIdOrUrl));

// ─── Source adapter ───────────────────────────────────────────────────────────

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
    const html = await requestText(
      buildListingUrl("/ComicList/MostPopular", page),
      context,
    );
    const parsed = parseListing(html);
    return { items: parsed.items, page, hasNextPage: parsed.hasNextPage };
  },

  async getLatestUpdates(params, context) {
    const page = params.page ?? 1;
    const html = await requestText(
      buildListingUrl("/ComicList/LatestUpdate", page),
      context,
    );
    const parsed = parseListing(html);
    return { items: parsed.items, page, hasNextPage: parsed.hasNextPage };
  },

  async search(params, context) {
    const page = params.page ?? 1;
    const query = cleanText(params.query);
    if (!query) {
      const html = await requestText(
        buildListingUrl("/ComicList/MostPopular", page),
        context,
      );
      const parsed = parseListing(html);
      return { items: parsed.items, page, hasNextPage: parsed.hasNextPage };
    }
    const html = await requestText(buildSearchUrl(query, page), context);
    const parsed = parseListing(html);
    return { items: parsed.items, page, hasNextPage: parsed.hasNextPage };
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

    // ── Server 1 (primary) ───────────────────────────────────────────────────
    const html = await requestText(
      buildChapterReadUrl(chapterUrl, ""),
      context,
    );
    const primaryPages = await parseChapterPages(
      chapterUrl,
      html,
      context,
      false,
    );
    if (primaryPages.length > 0) return primaryPages;

    // ── Server 2 (fallback) ──────────────────────────────────────────────────
    const fallbackHtml = await requestText(
      buildChapterReadUrl(chapterUrl, "s2"),
      context,
    );
    const fallbackPages = await parseChapterPages(
      chapterUrl,
      fallbackHtml,
      context,
      true,
    );
    if (fallbackPages.length > 0) return fallbackPages;

    return primaryPages;
  },
};
