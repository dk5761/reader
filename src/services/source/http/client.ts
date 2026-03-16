import axios, { AxiosHeaders } from "axios";
import type { AxiosError, AxiosResponse } from "axios";
import {
  attachCookiesToRequest,
  detectCloudflareChallenge,
  solveCloudflareAndRetry,
  type CloudflareAwareAxiosConfig,
} from "@/services/network/cloudflare";
import { DEFAULT_BROWSER_USER_AGENT } from "@/services/network/browserUserAgent";
import { getCfClearanceDebugState } from "@/services/cookies";
import { logReaderDiagnostic } from "@/services/diagnostics";

export const SOURCE_HTTP_TIMEOUT_MS = 20000;

const DEFAULT_SOURCE_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Content-Type": "application/json",
} as const;

const toAbsoluteUrl = (config?: CloudflareAwareAxiosConfig): string | null => {
  if (!config?.url) {
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

const summarizeResponseData = (data: unknown): Record<string, unknown> => {
  if (typeof data === "string") {
    return {
      type: "string",
      length: data.length,
      preview: data.slice(0, 240),
    };
  }

  if (data && typeof data === "object") {
    try {
      const serialized = JSON.stringify(data);
      return {
        type: "object",
        length: serialized.length,
        preview: serialized.slice(0, 240),
      };
    } catch {
      return {
        type: "object",
        preview: "unserializable",
      };
    }
  }

  return {
    type: typeof data,
    value: data ?? null,
  };
};

const summarizeResponseHeaders = (
  response?: AxiosResponse
): Record<string, string | null> => ({
  server:
    response?.headers?.server !== undefined ? String(response.headers.server) : null,
  cfRay:
    response?.headers?.["cf-ray"] !== undefined
      ? String(response.headers["cf-ray"])
      : null,
  contentType:
    response?.headers?.["content-type"] !== undefined
      ? String(response.headers["content-type"])
      : null,
});

export const sourceHttpClient = axios.create({
  timeout: SOURCE_HTTP_TIMEOUT_MS,
  headers: DEFAULT_SOURCE_HEADERS,
});

sourceHttpClient.interceptors.request.use(async (config) => {
  const headers = AxiosHeaders.from(config.headers as never);

  if (!headers.has("User-Agent")) {
    headers.set("User-Agent", DEFAULT_BROWSER_USER_AGENT);
  }

  config.headers = headers;

  await attachCookiesToRequest(config as CloudflareAwareAxiosConfig);
  return config;
});

sourceHttpClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const response = error.response as AxiosResponse | undefined;
    const config = error.config as CloudflareAwareAxiosConfig | undefined;

    if (!config) {
      throw error;
    }

    const detection = detectCloudflareChallenge(response);
    const absoluteUrl = toAbsoluteUrl(config);
    const clearanceState = absoluteUrl
      ? await getCfClearanceDebugState(absoluteUrl).catch((clearanceError) => ({
          url: absoluteUrl,
          error: clearanceError,
        }))
      : null;

    logReaderDiagnostic("source-http", "response error", {
      method: config.method?.toUpperCase() ?? "GET",
      url: absoluteUrl ?? config.url ?? null,
      status: response?.status ?? null,
      axiosCode: error.code ?? null,
      message: error.message,
      retryCount: config.__cfRetryCount ?? 0,
      cloudflareDetected: detection.isCloudflareChallenge,
      detectionReasons: detection.reasons,
      responseHeaders: summarizeResponseHeaders(response),
      responseData: summarizeResponseData(response?.data),
      clearanceState,
    });

    if (!detection.isCloudflareChallenge) {
      throw error;
    }

    logReaderDiagnostic("source-http", "cloudflare challenge detected", {
      method: config.method?.toUpperCase() ?? "GET",
      url: absoluteUrl ?? config.url ?? null,
      status: response?.status ?? null,
      retryCount: config.__cfRetryCount ?? 0,
      detectionReasons: detection.reasons,
      clearanceState,
    });

    try {
      return await solveCloudflareAndRetry(config, (nextConfig) =>
        sourceHttpClient.request(nextConfig)
      );
    } catch (retryError) {
      logReaderDiagnostic("source-http", "cloudflare retry failed", {
        method: config.method?.toUpperCase() ?? "GET",
        url: absoluteUrl ?? config.url ?? null,
        status: response?.status ?? null,
        retryCount: config.__cfRetryCount ?? 0,
        detectionReasons: detection.reasons,
        clearanceState,
        error: retryError,
      });
      throw retryError;
    }
  }
);
