import "react-native-reanimated";
import "../global.css";
import { Stack } from "expo-router";
import { HeroUINativeProvider } from "heroui-native";
import { PressablesConfig } from "pressto";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SourceProvider } from "@/services/source";
import { SessionProvider } from "@/shared/contexts/SessionContext";
import { WebViewFetcherProvider } from "@/shared/contexts/WebViewFetcherContext";
import { QueryProvider } from "@/services/query";
import { CloudflareChallengeHost } from "@/services/network/cloudflare";

export default function RootLayout() {
  return (
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
                  <Stack />
                  <CloudflareChallengeHost />
                </PressablesConfig>
              </HeroUINativeProvider>
            </GestureHandlerRootView>
          </SourceProvider>
        </WebViewFetcherProvider>
      </SessionProvider>
    </QueryProvider>
  );
}
