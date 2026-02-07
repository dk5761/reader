import axios from "axios";
import type { AxiosError, AxiosResponse } from "axios";
import {
  attachCookiesToRequest,
  detectCloudflareChallenge,
  solveCloudflareAndRetry,
  type CloudflareAwareAxiosConfig,
} from "@/services/network/cloudflare";

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
export const API_TIMEOUT_MS = 15000;

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use(async (config) => {
  await attachCookiesToRequest(config as CloudflareAwareAxiosConfig);
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const response = error.response as AxiosResponse | undefined;
    const config = error.config as CloudflareAwareAxiosConfig | undefined;

    if (!config) {
      throw error;
    }

    const detection = detectCloudflareChallenge(response);
    if (!detection.isCloudflareChallenge) {
      throw error;
    }

    return solveCloudflareAndRetry(config, (nextConfig) =>
      apiClient.request(nextConfig)
    );
  }
);
