import type { AxiosResponse } from "axios";
import type { CloudflareDetectionResult } from "./types";

const CF_STATUS_CODES = new Set([403, 429, 503]);

const CF_BODY_MARKERS = [
  "cf-browser-verification",
  "checking your browser before accessing",
  "/cdn-cgi/challenge-platform",
  "attention required! | cloudflare",
  "just a moment...",
  "cf-challenge",
  "turnstile",
];

const UNAUTHORIZED_API_MARKERS = ['"success":false', '"message":"unauthorized"'];

const normalizeBody = (data: unknown): string => {
  if (typeof data === "string") {
    return data.toLowerCase();
  }

  if (data && typeof data === "object") {
    try {
      return JSON.stringify(data).toLowerCase();
    } catch {
      return "";
    }
  }

  return "";
};

export const detectCloudflareChallenge = (
  response?: Pick<AxiosResponse, "status" | "headers" | "data">
): CloudflareDetectionResult => {
  if (!response) {
    return { isCloudflareChallenge: false, reasons: ["missing-response"] };
  }

  const reasons: string[] = [];
  const body = normalizeBody(response.data);
  const serverHeader = String(response.headers?.server ?? "").toLowerCase();
  const hasCfRay = Boolean(response.headers?.["cf-ray"]);
  const statusIsCfCandidate = CF_STATUS_CODES.has(response.status);

  if (statusIsCfCandidate) {
    reasons.push(`status:${response.status}`);
  }

  if (serverHeader.includes("cloudflare") || hasCfRay) {
    reasons.push("cloudflare-headers");
  }

  if (CF_BODY_MARKERS.some((marker) => body.includes(marker))) {
    reasons.push("cloudflare-body-markers");
  }

  const explicitApiUnauthorized = UNAUTHORIZED_API_MARKERS.every((marker) =>
    body.includes(marker)
  );

  const isCloudflareChallenge =
    statusIsCfCandidate &&
    !explicitApiUnauthorized &&
    reasons.some(
      (reason) =>
        reason === "cloudflare-headers" || reason === "cloudflare-body-markers"
    );

  return { isCloudflareChallenge, reasons };
};
