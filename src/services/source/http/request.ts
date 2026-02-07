import type {
  AxiosRequestConfig,
  AxiosResponse,
  RawAxiosResponseHeaders,
  ResponseType,
} from "axios";
import { toSourceRequestError } from "../core/errors";
import type {
  SourceRequestClient,
  SourceRequestOptions,
  SourceResponse,
} from "../core/types";
import { sourceHttpClient } from "./client";

const resolveResponseType = (
  responseType?: SourceRequestOptions["responseType"]
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
  headers: RawAxiosResponseHeaders | AxiosResponse["headers"]
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

const requestSource = async <T>(
  options: SourceRequestOptions
): Promise<SourceResponse<T>> => {
  const config: AxiosRequestConfig = {
    url: options.url,
    method: options.method,
    headers: options.headers,
    params: options.params,
    data: options.data,
    timeout: options.timeoutMs,
    responseType: resolveResponseType(options.responseType),
  };

  try {
    const response = await sourceHttpClient.request<T>(config);
    return mapResponse(response);
  } catch (error) {
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
