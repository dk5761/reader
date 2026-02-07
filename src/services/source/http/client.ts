import axios from "axios";
import type { AxiosError, AxiosResponse } from "axios";
import {
  attachCookiesToRequest,
  detectCloudflareChallenge,
  solveCloudflareAndRetry,
  type CloudflareAwareAxiosConfig,
} from "@/services/network/cloudflare";

export const SOURCE_HTTP_TIMEOUT_MS = 20000;

const DEFAULT_SOURCE_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Content-Type": "application/json",
} as const;

export const sourceHttpClient = axios.create({
  timeout: SOURCE_HTTP_TIMEOUT_MS,
  headers: DEFAULT_SOURCE_HEADERS,
});

sourceHttpClient.interceptors.request.use(async (config) => {
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
    if (!detection.isCloudflareChallenge) {
      throw error;
    }

    return solveCloudflareAndRetry(config, (nextConfig) =>
      sourceHttpClient.request(nextConfig)
    );
  }
);
