import "react-native-reanimated";
import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { HeroUINativeProvider } from "heroui-native";
import { PressablesConfig } from "pressto";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import { SourceProvider } from "@/services/source";
import { SessionProvider } from "@/shared/contexts/SessionContext";
import { WebViewFetcherProvider } from "@/shared/contexts/WebViewFetcherContext";
import { QueryProvider } from "@/services/query";
import { CloudflareChallengeHost } from "@/services/network/cloudflare";

Uniwind.setTheme("dark");

export default function RootLayout() {
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
                      edges={["top"]}
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
