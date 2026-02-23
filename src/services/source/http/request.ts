import type {
  AxiosRequestConfig,
  AxiosResponse,
  RawAxiosResponseHeaders,
  ResponseType,
} from "axios";
import { isAxiosError } from "axios";
import { toSourceRequestError } from "../core/errors";
import type {
  SourceRequestClient,
  SourceRequestOptions,
  SourceResponse,
} from "../core/types";
import { sourceHttpClient } from "./client";

const resolveResponseType = (
  responseType?: SourceRequestOptions["responseType"],
): ResponseType | undefined => {
  if (!responseType) {
    return undefined;
  }

  if (responseType === "arraybuffer") {
    return "arraybuffer";
  }

  if (responseType === "text") {
    return "text";
  }

  return "json";
};

const normalizeHeaders = (
  headers: RawAxiosResponseHeaders | AxiosResponse["headers"],
): Record<string, string> => {
  const normalized: Record<string, string> = {};

  Object.entries(headers as Record<string, unknown>).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      normalized[key] = value.join(", ");
      return;
    }

    if (value !== undefined && value !== null) {
      normalized[key] = String(value);
    }
  });

  return normalized;
};

const mapResponse = <T>(response: AxiosResponse<T>): SourceResponse<T> => ({
  data: response.data,
  status: response.status,
  headers: normalizeHeaders(response.headers),
  finalUrl: response.request?.responseURL ?? response.config.url ?? "",
});

// const rewriteLegacySourceUrl = (url: string): string => {
//   const value = url.trim();
//   if (!value) {
//     return value;
//   }

//   try {
//     const parsed = new URL(value);
//     const isManhwa18Host =
//       parsed.hostname === "manhwa18.net" || parsed.hostname === "www.manhwa18.net";

//     if (isManhwa18Host && parsed.pathname === "/tim-kiem") {
//       parsed.pathname = "/manga-list";
//       return parsed.toString();
//     }

//     return value;
//   } catch {
//     if (value.startsWith("https://manhwa18.net/tim-kiem")) {
//       return value.replace("https://manhwa18.net/tim-kiem", "https://manhwa18.net/manga-list");
//     }

//     if (value.startsWith("https://www.manhwa18.net/tim-kiem")) {
//       return value.replace(
//         "https://www.manhwa18.net/tim-kiem",
//         "https://www.manhwa18.net/manga-list"
//       );
//     }

//     if (value.startsWith("/tim-kiem")) {
//       return value.replace(/^\/tim-kiem/, "/manga-list");
//     }

//     return value;
//   }
// };

const requestSource = async <T>(
  options: SourceRequestOptions,
): Promise<SourceResponse<T>> => {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log("[SourceHttpDebug] request:start", {
      method: options.method ?? "GET",
      url: options.url,
      hasSignal: Boolean(options.signal),
    });
  }

  const config: AxiosRequestConfig = {
    url: options.url,
    method: options.method,
    headers: options.headers,
    params: options.params,
    data: options.data,
    timeout: options.timeoutMs,
    responseType: resolveResponseType(options.responseType),
    signal: options.signal,
  };

  try {
    const response = await sourceHttpClient.request<T>(config);
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("[SourceHttpDebug] request:success", {
        method: options.method ?? "GET",
        url: options.url,
        status: response.status,
      });
    }
    return mapResponse(response);
  } catch (error) {
    if (isAxiosError(error) && error.code === "ERR_CANCELED") {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[SourceHttpDebug] request:cancelled", {
          method: options.method ?? "GET",
          url: options.url,
          reason: error.message,
        });
      }
      throw error;
    }
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("[SourceHttpDebug] request:error", {
        method: options.method ?? "GET",
        url: options.url,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    throw toSourceRequestError(error);
  }
};

export const sourceRequestClient: SourceRequestClient = {
  request: requestSource,
  get: (url, options) =>
    requestSource({
      ...options,
      url,
      method: "GET",
    }),
  post: (url, data, options) =>
    requestSource({
      ...options,
      url,
      data,
      method: "POST",
    }),
};

export { requestSource };
