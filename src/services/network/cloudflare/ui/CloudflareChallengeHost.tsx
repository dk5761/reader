import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Platform, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { PressableScale } from "pressto";
import { WebView } from "react-native-webview";
import {
  CF_COOKIE_POLL_INTERVAL_MS,
  CF_MANUAL_SOLVE_TIMEOUT_MS,
} from "../core/constants";
import { cloudflareSolverController } from "../core/solverController";
import type { CloudflareSolveRequest, CloudflareSolveResult } from "../core/types";
import {
  hasValidCfClearance,
  solveCloudflareChallenge,
  syncWebViewCookies,
} from "@/services/cookies";
import { logReaderDiagnostic } from "@/services/diagnostics";

interface SolveSession {
  id: string;
  url: string;
  webViewUrl: string;
  headers?: Record<string, string>;
  userAgent?: string;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const createSessionId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const createSession = (request: CloudflareSolveRequest): SolveSession => ({
  id: createSessionId(),
  url: request.url,
  webViewUrl: request.webViewUrl,
  headers: request.headers,
  userAgent: request.userAgent,
});

export const CloudflareChallengeHost = () => {
  const [autoSession, setAutoSession] = useState<SolveSession | null>(null);
  const [manualSession, setManualSession] = useState<SolveSession | null>(null);
  const manualCancelRef = useRef(false);
  const manualDoneRef = useRef(false);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const runAutoSolve = useCallback(
    async (request: CloudflareSolveRequest): Promise<CloudflareSolveResult> => {
      logReaderDiagnostic("cloudflare-ui", "auto solve started", {
        domain: request.domain,
        url: request.url,
        webViewUrl: request.webViewUrl,
        mode: Platform.OS === "ios" ? "native_offscreen" : "hidden_webview",
        autoTimeoutMs: request.autoTimeoutMs,
      });

      if (Platform.OS === "ios") {
        try {
          const result = await solveCloudflareChallenge(
            request.webViewUrl,
            request.userAgent,
            request.headers ?? {},
            request.autoTimeoutMs
          );

          logReaderDiagnostic("cloudflare-ui", "native auto solve finished", {
            domain: request.domain,
            url: request.url,
            webViewUrl: request.webViewUrl,
            result,
          });

          if (result.success) {
            await syncWebViewCookies(request.url);
            const hasClearance = await hasValidCfClearance(request.url);

            if (hasClearance) {
              logReaderDiagnostic("cloudflare-ui", "native auto solve succeeded", {
                domain: request.domain,
                url: request.url,
              });
              return { success: true, mode: "auto" };
            }
          }
        } catch (error) {
          logReaderDiagnostic("cloudflare-ui", "native auto solve failed", {
            domain: request.domain,
            url: request.url,
            webViewUrl: request.webViewUrl,
            error,
          });
        }

        return { success: false, mode: "auto", reason: "auto_timeout" };
      }

      const session = createSession(request);
      logReaderDiagnostic("cloudflare-ui", "webview auto solve session created", {
        sessionId: session.id,
        domain: request.domain,
        url: request.url,
        webViewUrl: request.webViewUrl,
      });
      setAutoSession(session);
      await wait(350);

      const deadline = Date.now() + request.autoTimeoutMs;

      while (Date.now() < deadline) {
        try {
          await syncWebViewCookies(request.url);
          const hasClearance = await hasValidCfClearance(request.url);
          if (hasClearance) {
            setAutoSession(null);
            logReaderDiagnostic("cloudflare-ui", "webview auto solve succeeded", {
              sessionId: session.id,
              domain: request.domain,
              url: request.url,
            });
            return { success: true, mode: "auto" };
          }
        } catch (error) {
          logReaderDiagnostic("cloudflare-ui", "webview auto solve poll error", {
            sessionId: session.id,
            domain: request.domain,
            url: request.url,
            error,
          });
          // Ignore intermediate sync/check errors and continue polling.
        }

        await wait(CF_COOKIE_POLL_INTERVAL_MS);
      }

      setAutoSession(null);
      logReaderDiagnostic("cloudflare-ui", "webview auto solve timed out", {
        sessionId: session.id,
        domain: request.domain,
        url: request.url,
        autoTimeoutMs: request.autoTimeoutMs,
      });
      return { success: false, mode: "auto", reason: "auto_timeout" };
    },
    []
  );

  const runManualSolve = useCallback(
    async (request: CloudflareSolveRequest): Promise<CloudflareSolveResult> => {
      manualCancelRef.current = false;
      manualDoneRef.current = false;

      const session = createSession(request);
      logReaderDiagnostic("cloudflare-ui", "manual solve session created", {
        sessionId: session.id,
        domain: request.domain,
        url: request.url,
        webViewUrl: request.webViewUrl,
      });
      setManualSession(session);
      await wait(350);

      const timeoutMs =
        request.manualTimeoutMs > 0
          ? request.manualTimeoutMs
          : CF_MANUAL_SOLVE_TIMEOUT_MS;
      const deadline = Date.now() + timeoutMs;

      while (Date.now() < deadline) {
        if (manualCancelRef.current) {
          setManualSession(null);
          logReaderDiagnostic("cloudflare-ui", "manual solve cancelled", {
            sessionId: session.id,
            domain: request.domain,
            url: request.url,
          });
          return {
            success: false,
            mode: "manual",
            reason: "manual_cancelled",
          };
        }

        try {
          await syncWebViewCookies(request.url);
          const hasClearance = await hasValidCfClearance(request.url);
          if (hasClearance) {
            setManualSession(null);
            logReaderDiagnostic("cloudflare-ui", "manual solve succeeded", {
              sessionId: session.id,
              domain: request.domain,
              url: request.url,
            });
            return { success: true, mode: "manual" };
          }
        } catch (error) {
          logReaderDiagnostic("cloudflare-ui", "manual solve poll error", {
            sessionId: session.id,
            domain: request.domain,
            url: request.url,
            error,
          });
          // Keep polling until timeout or cancellation.
        }

        // "Done" button requests a quick re-check cycle.
        const interval = manualDoneRef.current ? 250 : CF_COOKIE_POLL_INTERVAL_MS;
        manualDoneRef.current = false;
        await wait(interval);
      }

      setManualSession(null);
      logReaderDiagnostic("cloudflare-ui", "manual solve timed out", {
        sessionId: session.id,
        domain: request.domain,
        url: request.url,
      });
      return { success: false, mode: "manual", reason: "manual_timeout" };
    },
    []
  );

  const solveRequest = useCallback(
    async (request: CloudflareSolveRequest): Promise<CloudflareSolveResult> => {
      const autoResult = await runAutoSolve(request);
      if (autoResult.success || !request.allowManualFallback) {
        return autoResult;
      }

      return runManualSolve(request);
    },
    [runAutoSolve, runManualSolve]
  );

  useEffect(() => {
    const unregister = cloudflareSolverController.registerHandler((request) => {
      const solvePromise = queueRef.current.then(() => solveRequest(request));
      queueRef.current = solvePromise.then(
        () => undefined,
        () => undefined
      );

      return solvePromise;
    });

    return unregister;
  }, [solveRequest]);

  return (
    <>
      {autoSession ? (
        <WebView
          key={autoSession.id}
          source={{
            uri: autoSession.webViewUrl,
            headers: autoSession.headers,
          }}
          pointerEvents="none"
          style={styles.hiddenWebView}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          userAgent={autoSession.userAgent}
          onLoadEnd={() => {
            logReaderDiagnostic("cloudflare-ui", "auto webview load end", {
              sessionId: autoSession.id,
              url: autoSession.url,
              webViewUrl: autoSession.webViewUrl,
            });
            void syncWebViewCookies(autoSession.url);
          }}
        />
      ) : null}

      <Modal
        visible={Boolean(manualSession)}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <SafeAreaView style={styles.modalRoot}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Cloudflare Verification</Text>
            <View style={styles.headerActions}>
              <PressableScale
                style={styles.headerButton}
                onPress={() => {
                  logReaderDiagnostic("cloudflare-ui", "manual solve done pressed", {
                    sessionId: manualSession?.id ?? null,
                    url: manualSession?.url ?? null,
                  });
                  manualDoneRef.current = true;
                }}
              >
                <Text style={styles.headerButtonText}>Done</Text>
              </PressableScale>
              <PressableScale
                style={styles.headerButton}
                onPress={() => {
                  logReaderDiagnostic("cloudflare-ui", "manual solve cancel pressed", {
                    sessionId: manualSession?.id ?? null,
                    url: manualSession?.url ?? null,
                  });
                  manualCancelRef.current = true;
                }}
              >
                <Text style={styles.headerButtonText}>Cancel</Text>
              </PressableScale>
            </View>
          </View>

          {manualSession ? (
            <WebView
              key={manualSession.id}
              source={{
                uri: manualSession.webViewUrl,
                headers: manualSession.headers,
              }}
              style={styles.manualWebView}
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              userAgent={manualSession.userAgent}
              onLoadEnd={() => {
                logReaderDiagnostic("cloudflare-ui", "manual webview load end", {
                  sessionId: manualSession.id,
                  url: manualSession.url,
                  webViewUrl: manualSession.webViewUrl,
                });
                void syncWebViewCookies(manualSession.url);
                manualDoneRef.current = true;
              }}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  hiddenWebView: {
    position: "absolute",
    top: -10000,
    left: -10000,
    width: 1,
    height: 1,
    opacity: 0,
    backgroundColor: "transparent",
  },
  modalRoot: {
    flex: 1,
    backgroundColor: "#0B0B0B",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#303030",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#2A2A2A",
  },
  headerButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  manualWebView: {
    flex: 1,
    backgroundColor: "#0B0B0B",
  },
});
