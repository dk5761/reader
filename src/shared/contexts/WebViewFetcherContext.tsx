import type { ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";

interface WebViewFetcherContextValue {
  fetcher: typeof fetch;
}

const WebViewFetcherContext = createContext<
  WebViewFetcherContextValue | undefined
>(undefined);

export const WebViewFetcherProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const value = useMemo(
    () => ({
      fetcher: fetch,
    }),
    []
  );

  return (
    <WebViewFetcherContext.Provider value={value}>
      {children}
    </WebViewFetcherContext.Provider>
  );
};

export const useWebViewFetcher = () => {
  const context = useContext(WebViewFetcherContext);

  if (!context) {
    throw new Error(
      "useWebViewFetcher must be used within WebViewFetcherProvider."
    );
  }

  return context.fetcher;
};
