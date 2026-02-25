import "react-native-reanimated";
import "../global.css";
import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { HeroUINativeProvider } from "heroui-native";
import { PressablesConfig } from "pressto";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView, type Edge } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import { startAppUpdateForegroundListener } from "@/services/app-update";
import { SourceProvider } from "@/services/source";
import { SessionProvider } from "@/shared/contexts/SessionContext";
import { WebViewFetcherProvider } from "@/shared/contexts/WebViewFetcherContext";
import { QueryProvider } from "@/services/query";
import { CloudflareChallengeHost } from "@/services/network/cloudflare";
import { initializeDatabase } from "@/services/db";

Uniwind.setTheme("dark");
initializeDatabase();

export default function RootLayout() {
  const pathname = usePathname();
  const safeAreaEdges: Edge[] = pathname?.startsWith("/reader/") ? [] : ["top"];

  useEffect(() => {
    const stopListening = startAppUpdateForegroundListener();
    return () => {
      stopListening();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <QueryProvider>
        <SessionProvider>
          <WebViewFetcherProvider>
            <SourceProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <HeroUINativeProvider>
                  <PressablesConfig
                    animationType="timing"
                    config={{ minScale: 0.97, activeOpacity: 0.85 }}
                  >
                    <StatusBar style="light" />
                    <SafeAreaView
                      edges={safeAreaEdges}
                      style={{ flex: 1, backgroundColor: "#111214" }}
                    >
                      <Stack>
                        <Stack.Screen
                          name="(tabs)"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="source/[sourceId]"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="manga/[sourceId]/[mangaId]"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="history/[sourceId]/[mangaId]"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="updates"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="settings/webtoon-loading"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="settings/reader-magnifier"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="reader/[sourceId]/[mangaId]/[chapterId]"
                          options={{ headerShown: false }}
                        />
                      </Stack>
                    </SafeAreaView>
                    <CloudflareChallengeHost />
                  </PressablesConfig>
                </HeroUINativeProvider>
              </GestureHandlerRootView>
            </SourceProvider>
          </WebViewFetcherProvider>
        </SessionProvider>
      </QueryProvider>
    </SafeAreaProvider>
  );
}
