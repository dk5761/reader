import { AxiosHeaders } from "axios";
import type { AxiosRequestConfig, AxiosResponse } from "axios";
import {
  clearCfClearance,
  getCfClearanceDebugState,
  getCookieHeaderForUrl,
  getDomainFromUrl,
  hasValidCfClearance,
} from "@/services/cookies";
import { logReaderDiagnostic } from "@/services/diagnostics";
import {
  CF_AUTO_SOLVE_TIMEOUT_MS,
  CF_MANUAL_SOLVE_TIMEOUT_MS,
  CF_MAX_RETRY_ATTEMPTS,
} from "./constants";
import { cloudflareDomainLock } from "./domainLock";
import {
  CloudflareClearanceMissingError,
  CloudflareRetryLimitExceededError,
  CloudflareSolveFailedError,
} from "./errors";
import { cloudflareSolverController } from "./solverController";

export interface CloudflareAwareAxiosConfig extends AxiosRequestConfig {
  __cfRetryCount?: number;
}

interface RetryContext {
  config: CloudflareAwareAxiosConfig;
  absoluteUrl: string;
  domain: string;
}

const UNSAFE_WEBVIEW_REQUEST_HEADERS = new Set([
  "accept-encoding",
  "content-length",
  "content-type",
  "host",
  "origin",
  "referer",
  "trailer",
  "te",
  "upgrade",
  "cookie",
  "cookie2",
  "keep-alive",
  "transfer-encoding",
  "set-cookie",
  "connection",
]);

const toAbsoluteUrl = (config: AxiosRequestConfig): string | null => {
  if (!config.url) {
    return null;
  }

  try {
    return new URL(config.url).toString();
  } catch {
    if (!config.baseURL) {
      return null;
    }

    try {
      return new URL(config.url, config.baseURL).toString();
    } catch {
      return null;
    }
  }
};

const mergeCookieHeader = (
  config: CloudflareAwareAxiosConfig,
  cookieHeader: string
) => {
  if (!cookieHeader) {
    return;
  }

  const headers = AxiosHeaders.from(config.headers as never);
  headers.set("Cookie", cookieHeader);
  config.headers = headers;
};

const extractWebViewHeaders = (
  config: CloudflareAwareAxiosConfig
): { headers: Record<string, string>; userAgent?: string } => {
  const sourceHeaders = AxiosHeaders.from(config.headers as never).toJSON(true);
  const headers: Record<string, string> = {};
  let userAgent: string | undefined;

  Object.entries(sourceHeaders).forEach(([name, value]) => {
    const normalizedName = name.trim();
    const lowerName = normalizedName.toLowerCase();

    if (!normalizedName || UNSAFE_WEBVIEW_REQUEST_HEADERS.has(lowerName)) {
      return;
    }

    const headerValue = String(value).trim();
    if (!headerValue) {
      return;
    }

    if (lowerName === "user-agent") {
      userAgent = headerValue;
      return;
    }

    headers[normalizedName] = headerValue;
  });

  return { headers, userAgent };
};

const createRetryContext = (
  config: CloudflareAwareAxiosConfig
): RetryContext | null => {
  const absoluteUrl = toAbsoluteUrl(config);
  if (!absoluteUrl) {
    return null;
  }

  const domain = getDomainFromUrl(absoluteUrl);
  return { config, absoluteUrl, domain };
};

const resolveWebViewUrl = (absoluteUrl: string): string => {
  try {
    const parsedUrl = new URL(absoluteUrl);
    if (parsedUrl.pathname.startsWith("/api/")) {
      return new URL("/", absoluteUrl).toString();
    }

    return absoluteUrl;
  } catch {
    return absoluteUrl;
  }
};

export const attachCookiesToRequest = async (
  config: CloudflareAwareAxiosConfig
): Promise<void> => {
  const context = createRetryContext(config);
  if (!context) {
    return;
  }

  const cookieHeader = await getCookieHeaderForUrl(context.absoluteUrl);
  mergeCookieHeader(config, cookieHeader);
};

export const solveCloudflareAndRetry = async (
  config: CloudflareAwareAxiosConfig,
  executeRequest: (nextConfig: CloudflareAwareAxiosConfig) => Promise<AxiosResponse>
): Promise<AxiosResponse> => {
  const context = createRetryContext(config);
  if (!context) {
    throw new Error("Cannot resolve URL/domain for Cloudflare challenge retry.");
  }

  const retryCount = context.config.__cfRetryCount ?? 0;
  if (retryCount >= CF_MAX_RETRY_ATTEMPTS) {
    logReaderDiagnostic("cloudflare", "retry limit exceeded", {
      domain: context.domain,
      url: context.absoluteUrl,
      retryCount,
    });
    throw new CloudflareRetryLimitExceededError(context.domain, retryCount);
  }

  const preSolveClearanceState = await getCfClearanceDebugState(context.absoluteUrl).catch(
    (error) => ({
      domain: context.domain,
      url: context.absoluteUrl,
      error,
    })
  );

  logReaderDiagnostic("cloudflare", "retry solve started", {
    domain: context.domain,
    url: context.absoluteUrl,
    retryCount,
    webViewUrl: resolveWebViewUrl(context.absoluteUrl),
    preSolveClearanceState,
  });

  try {
    await cloudflareDomainLock.run(context.domain, async () => {
      await clearCfClearance(context.absoluteUrl);
      logReaderDiagnostic("cloudflare", "clearance cleared before solve", {
        domain: context.domain,
        url: context.absoluteUrl,
      });

      const { headers, userAgent } = extractWebViewHeaders(context.config);

      const solveResult = await cloudflareSolverController.solve({
        url: context.absoluteUrl,
        webViewUrl: resolveWebViewUrl(context.absoluteUrl),
        domain: context.domain,
        headers,
        userAgent,
        allowManualFallback: true,
        autoTimeoutMs: CF_AUTO_SOLVE_TIMEOUT_MS,
        manualTimeoutMs: CF_MANUAL_SOLVE_TIMEOUT_MS,
      });

      logReaderDiagnostic("cloudflare", "solve attempt finished", {
        domain: context.domain,
        url: context.absoluteUrl,
        retryCount,
        solveResult,
      });

      if (!solveResult.success) {
        throw new CloudflareSolveFailedError(
          context.domain,
          solveResult.reason ?? "unknown"
        );
      }

      const hasClearance = await hasValidCfClearance(context.absoluteUrl);
      const postSolveClearanceState = await getCfClearanceDebugState(
        context.absoluteUrl
      ).catch((error) => ({
        domain: context.domain,
        url: context.absoluteUrl,
        error,
      }));

      logReaderDiagnostic("cloudflare", "post-solve clearance check", {
        domain: context.domain,
        url: context.absoluteUrl,
        retryCount,
        hasClearance,
        postSolveClearanceState,
      });

      if (!hasClearance) {
        throw new CloudflareClearanceMissingError(context.domain);
      }
    });
  } catch (error) {
    const failureClearanceState = await getCfClearanceDebugState(context.absoluteUrl).catch(
      (clearanceError) => ({
        domain: context.domain,
        url: context.absoluteUrl,
        error: clearanceError,
      })
    );

    logReaderDiagnostic("cloudflare", "retry solve failed", {
      domain: context.domain,
      url: context.absoluteUrl,
      retryCount,
      failureClearanceState,
      error,
    });
    throw error;
  }

  const nextConfig: CloudflareAwareAxiosConfig = {
    ...context.config,
    __cfRetryCount: retryCount + 1,
  };

  const cookieHeader = await getCookieHeaderForUrl(context.absoluteUrl);
  mergeCookieHeader(nextConfig, cookieHeader);
  logReaderDiagnostic("cloudflare", "retrying request after solve", {
    domain: context.domain,
    url: context.absoluteUrl,
    nextRetryCount: nextConfig.__cfRetryCount,
    hasCookieHeader: Boolean(cookieHeader),
  });
  return executeRequest(nextConfig);
};
