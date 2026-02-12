/**
 * Shared utility functions used across the app.
 */

/**
 * Decodes a route parameter that may be a string, array of strings, or undefined.
 * Handles common expo-router param encoding issues.
 */
export const getDecodedParam = (
  value: string | string[] | undefined,
): string => {
  const paramValue = Array.isArray(value) ? value[0] : value;
  if (!paramValue) return "";
  try {
    return decodeURIComponent(paramValue);
  } catch {
    return paramValue;
  }
};

/**
 * Formats a timestamp into a relative time string (e.g., "5m ago", "2d ago").
 */
export const formatRelativeTime = (timestamp: number): string => {
  const diffMs = Math.max(0, Date.now() - timestamp);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (diffMs < minuteMs) {
    return "just now";
  }

  if (diffMs < hourMs) {
    return `${Math.floor(diffMs / minuteMs)}m ago`;
  }

  if (diffMs < dayMs) {
    return `${Math.floor(diffMs / hourMs)}h ago`;
  }

  if (diffMs < dayMs * 7) {
    return `${Math.floor(diffMs / dayMs)}d ago`;
  }

  return new Date(timestamp).toLocaleDateString();
};

/**
 * Extracts the hostname from a URL string.
 */
export const getHostLabel = (baseUrl: string): string => {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
};
