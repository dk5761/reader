import { Image, type ImageProps } from "expo-image";
import { useEffect, useState } from "react";
import { getCookieHeaderForUrl, getOriginFromUrl } from "@/services/cookies";
import { DEFAULT_BROWSER_USER_AGENT } from "@/services/network/browserUserAgent";

interface AuthenticatedImageProps extends Omit<ImageProps, "source"> {
  uri: string;
  requestHeaders?: Record<string, string>;
}

const IMAGE_ACCEPT_HEADER = "image/*,*/*;q=0.8";
const HEADER_CACHE_TTL_MS = 15000;
const EMPTY_HEADER_CACHE_TTL_MS = 1000;

const cookieHeaderCache = new Map<string, { value: string; expiresAt: number }>();
const pendingCookieLookups = new Map<string, Promise<string>>();

const isCacheEntryValid = (entry?: { value: string; expiresAt: number }) =>
  Boolean(entry) && (entry?.expiresAt ?? 0) > Date.now();

const getCookieHeaderForImage = async (uri: string): Promise<string> => {
  const cacheKey = getOriginFromUrl(uri);
  const cached = cookieHeaderCache.get(cacheKey);
  if (isCacheEntryValid(cached)) {
    return cached?.value ?? "";
  }

  const pending = pendingCookieLookups.get(cacheKey);
  if (pending) {
    return pending;
  }

  const lookupPromise = getCookieHeaderForUrl(uri)
    .then((cookieHeader) => {
      cookieHeaderCache.set(cacheKey, {
        value: cookieHeader,
        expiresAt:
          Date.now() +
          (cookieHeader ? HEADER_CACHE_TTL_MS : EMPTY_HEADER_CACHE_TTL_MS),
      });
      return cookieHeader;
    })
    .catch(() => "")
    .finally(() => {
      pendingCookieLookups.delete(cacheKey);
    });

  pendingCookieLookups.set(cacheKey, lookupPromise);
  return lookupPromise;
};

export function AuthenticatedImage({
  uri,
  requestHeaders,
  ...imageProps
}: AuthenticatedImageProps) {
  const [cookieHeader, setCookieHeader] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setCookieHeader(null);

    void getCookieHeaderForImage(uri).then((nextCookieHeader) => {
      if (!cancelled) {
        setCookieHeader(nextCookieHeader);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [uri]);

  const headers: Record<string, string> = {
    Accept: IMAGE_ACCEPT_HEADER,
    "User-Agent": DEFAULT_BROWSER_USER_AGENT,
    ...(requestHeaders ?? {}),
  };

  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  return <Image {...imageProps} source={{ uri, headers }} />;
}
