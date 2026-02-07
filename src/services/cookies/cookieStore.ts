import CookieManager from "@react-native-cookies/cookies";
import { Platform } from "react-native";
import {
  clearCfClearance as clearCfClearanceFromWebView,
  getCookieString as getWebViewCookieString,
  isCfClearanceValid as isWebViewCfClearanceValid,
  syncCookiesToNative,
} from "cookie-sync";

const CF_CLEARANCE_COOKIE_NAME = "cf_clearance";

const parseUrl = (input: string) => {
  try {
    return new URL(input);
  } catch {
    return new URL(`https://${input}`);
  }
};

export const getOriginFromUrl = (url: string) => parseUrl(url).origin;

export const getDomainFromUrl = (url: string) => parseUrl(url).hostname;

const buildCookieHeaderFromMap = (
  cookieMap: Record<string, { value: string }>
): string =>
  Object.entries(cookieMap)
    .filter(([, cookie]) => Boolean(cookie?.value))
    .map(([name, cookie]) => `${name}=${cookie.value}`)
    .join("; ");

export const getCookieHeaderForUrl = async (url: string): Promise<string> => {
  const targetUrl = getOriginFromUrl(url);

  try {
    if (Platform.OS === "ios") {
      const webViewCookieHeader = await getWebViewCookieString(targetUrl);
      if (webViewCookieHeader) {
        return webViewCookieHeader;
      }
    }
  } catch {
    // Fall through to CookieManager lookup.
  }

  const cookieMap = await CookieManager.get(targetUrl, Platform.OS === "ios");
  return buildCookieHeaderFromMap(cookieMap);
};

export const syncWebViewCookies = async (url: string): Promise<void> => {
  const targetUrl = getOriginFromUrl(url);

  if (Platform.OS === "ios") {
    await syncCookiesToNative(targetUrl);
    return;
  }

  // Ensure Android's CookieManager persists the latest cookie jar state.
  await CookieManager.flush();
};

export const hasValidCfClearance = async (url: string): Promise<boolean> => {
  const targetUrl = getOriginFromUrl(url);

  if (Platform.OS === "ios") {
    const validity = await isWebViewCfClearanceValid(targetUrl);
    return validity.isValid;
  }

  const cookieMap = await CookieManager.get(targetUrl);
  const cfCookie = cookieMap[CF_CLEARANCE_COOKIE_NAME];
  return Boolean(cfCookie?.value);
};

export const clearCfClearance = async (url: string): Promise<void> => {
  const targetUrl = getOriginFromUrl(url);

  if (Platform.OS === "ios") {
    await clearCfClearanceFromWebView(targetUrl);
    return;
  }

  // Expire the cookie explicitly on Android.
  await CookieManager.set(targetUrl, {
    name: CF_CLEARANCE_COOKIE_NAME,
    value: "",
    expires: "1970-01-01T00:00:00.000Z",
    path: "/",
  });
  await CookieManager.flush();
};
