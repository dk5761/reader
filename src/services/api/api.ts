import type { AxiosRequestConfig } from "axios";
import { apiClient } from "./api.client";
import { toApiError } from "./api.types";

const resolveData = async <T>(request: Promise<{ data: T }>): Promise<T> => {
  try {
    const response = await request;
    return response.data;
  } catch (error) {
    throw toApiError(error);
  }
};

export const get = <T>(
  url: string,
  config?: AxiosRequestConfig
): Promise<T> => resolveData(apiClient.get<T>(url, config));

export const post = <TResponse, TBody = unknown>(
  url: string,
  body?: TBody,
  config?: AxiosRequestConfig<TBody>
): Promise<TResponse> => resolveData(apiClient.post<TResponse>(url, body, config));

export const put = <TResponse, TBody = unknown>(
  url: string,
  body?: TBody,
  config?: AxiosRequestConfig<TBody>
): Promise<TResponse> => resolveData(apiClient.put<TResponse>(url, body, config));

export const patch = <TResponse, TBody = unknown>(
  url: string,
  body?: TBody,
  config?: AxiosRequestConfig<TBody>
): Promise<TResponse> => resolveData(apiClient.patch<TResponse>(url, body, config));

export const remove = <TResponse>(
  url: string,
  config?: AxiosRequestConfig
): Promise<TResponse> => resolveData(apiClient.delete<TResponse>(url, config));
