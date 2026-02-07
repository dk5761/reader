import { requireNativeModule, Platform } from "expo-modules-core";

interface CookieResult {
  cookieString: string;
  count: number;
  domain: string;
}

interface CfClearanceResult {
  hasCfClearance: boolean;
  domain: string;
  cookieValue: string;
}

interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  isSecure: boolean;
  isHTTPOnly: boolean;
  expiresDate: number;
}

interface CookiesResult {
  cookies: Cookie[];
  domain: string;
}

interface SyncResult {
  success: boolean;
  syncedCount: number;
  domain: string;
}

interface CfValidityResult {
  isValid: boolean;
  exists: boolean;
  isExpired?: boolean;
  expiresDate?: number;
  domain: string;
}

interface ClearResult {
  success: boolean;
  cleared: number;
  domain: string;
}

interface CookieSyncModuleType {
  getCookieString(url: string): Promise<CookieResult>;
  hasCfClearance(url: string): Promise<CfClearanceResult>;
  getCookiesFromWebView(url: string): Promise<CookiesResult>;
  syncCookiesToNative(url: string): Promise<SyncResult>;
  isCfClearanceValid(url: string): Promise<CfValidityResult>;
  clearCfClearance(url: string): Promise<ClearResult>;
}

// Only available on iOS
const CookieSyncModule: CookieSyncModuleType | null =
  Platform.OS === "ios" ? requireNativeModule("CookieSync") : null;

/**
 * Get cookie string from WKWebView for HTTP headers
 * iOS only - returns empty on other platforms
 */
export async function getCookieString(url: string): Promise<string> {
  if (!CookieSyncModule) {
    console.log("[CookieSync] Not available on this platform");
    return "";
  }
  const result = await CookieSyncModule.getCookieString(url);
  return result.cookieString;
}

/**
 * Check if cf_clearance cookie exists in WKWebView
 * iOS only - returns false on other platforms
 */
export async function hasCfClearance(url: string): Promise<boolean> {
  if (!CookieSyncModule) {
    return false;
  }
  const result = await CookieSyncModule.hasCfClearance(url);
  return result.hasCfClearance;
}

/**
 * Get all cookies from WKWebView for a domain
 * iOS only - returns empty array on other platforms
 */
export async function getCookiesFromWebView(url: string): Promise<Cookie[]> {
  if (!CookieSyncModule) {
    return [];
  }
  const result = await CookieSyncModule.getCookiesFromWebView(url);
  return result.cookies;
}

/**
 * Sync cookies from WKWebView to native HTTP storage
 * iOS only - no-op on other platforms
 */
export async function syncCookiesToNative(url: string): Promise<number> {
  if (!CookieSyncModule) {
    return 0;
  }
  const result = await CookieSyncModule.syncCookiesToNative(url);
  return result.syncedCount;
}

/**
 * Check if cf_clearance token exists AND is not expired
 * iOS only - returns { isValid: false, exists: false } on other platforms
 */
export async function isCfClearanceValid(
  url: string
): Promise<{ isValid: boolean; exists: boolean; expiresDate?: number }> {
  if (!CookieSyncModule) {
    return { isValid: false, exists: false };
  }
  const result = await CookieSyncModule.isCfClearanceValid(url);
  return {
    isValid: result.isValid,
    exists: result.exists,
    expiresDate: result.expiresDate,
  };
}

/**
 * Clear cf_clearance cookie for a domain (to force fresh challenge)
 * iOS only - no-op on other platforms
 */
export async function clearCfClearance(url: string): Promise<number> {
  if (!CookieSyncModule) {
    return 0;
  }
  const result = await CookieSyncModule.clearCfClearance(url);
  return result.cleared;
}

export default {
  getCookieString,
  hasCfClearance,
  getCookiesFromWebView,
  syncCookiesToNative,
  isCfClearanceValid,
  clearCfClearance,
};
