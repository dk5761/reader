import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import {
  CF_COOKIE_POLL_INTERVAL_MS,
  CF_MANUAL_SOLVE_TIMEOUT_MS,
} from "../core/constants";
import { cloudflareSolverController } from "../core/solverController";
import type { CloudflareSolveRequest, CloudflareSolveResult } from "../core/types";
import { hasValidCfClearance, syncWebViewCookies } from "@/services/cookies";

interface SolveSession {
  id: string;
  url: string;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const createSessionId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const CloudflareChallengeHost = () => {
  const [autoSession, setAutoSession] = useState<SolveSession | null>(null);
  const [manualSession, setManualSession] = useState<SolveSession | null>(null);
  const manualCancelRef = useRef(false);
  const manualDoneRef = useRef(false);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const runAutoSolve = useCallback(
    async (request: CloudflareSolveRequest): Promise<CloudflareSolveResult> => {
      const session = { id: createSessionId(), url: request.url };
      setAutoSession(session);
      await wait(350);

      const deadline = Date.now() + request.autoTimeoutMs;

      while (Date.now() < deadline) {
        try {
          await syncWebViewCookies(request.url);
          const hasClearance = await hasValidCfClearance(request.url);
          if (hasClearance) {
            setAutoSession(null);
            return { success: true, mode: "auto" };
          }
        } catch {
          // Ignore intermediate sync/check errors and continue polling.
        }

        await wait(CF_COOKIE_POLL_INTERVAL_MS);
      }

      setAutoSession(null);
      return { success: false, mode: "auto", reason: "auto_timeout" };
    },
    []
  );

  const runManualSolve = useCallback(
    async (request: CloudflareSolveRequest): Promise<CloudflareSolveResult> => {
      manualCancelRef.current = false;
      manualDoneRef.current = false;

      const session = { id: createSessionId(), url: request.url };
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
            return { success: true, mode: "manual" };
          }
        } catch {
          // Keep polling until timeout or cancellation.
        }

        // "Done" button requests a quick re-check cycle.
        const interval = manualDoneRef.current ? 250 : CF_COOKIE_POLL_INTERVAL_MS;
        manualDoneRef.current = false;
        await wait(interval);
      }

      setManualSession(null);
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
          source={{ uri: autoSession.url }}
          style={styles.hiddenWebView}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
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
              <Pressable
                style={styles.headerButton}
                onPress={() => {
                  manualDoneRef.current = true;
                }}
              >
                <Text style={styles.headerButtonText}>Done</Text>
              </Pressable>
              <Pressable
                style={styles.headerButton}
                onPress={() => {
                  manualCancelRef.current = true;
                }}
              >
                <Text style={styles.headerButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>

          {manualSession ? (
            <WebView
              key={manualSession.id}
              source={{ uri: manualSession.url }}
              style={styles.manualWebView}
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
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
    width: 1,
    height: 1,
    opacity: 0,
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
