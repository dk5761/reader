import "react-native-reanimated";
import "../global.css";
import { Stack } from "expo-router";
import { HeroUINativeProvider } from "heroui-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SessionProvider } from "@/shared/contexts/SessionContext";
import { WebViewFetcherProvider } from "@/shared/contexts/WebViewFetcherContext";
import { QueryProvider } from "@/services/query";
import { CloudflareChallengeHost } from "@/services/network/cloudflare";

export default function RootLayout() {
  return (
    <QueryProvider>
      <SessionProvider>
        <WebViewFetcherProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <HeroUINativeProvider>
              <Stack />
              <CloudflareChallengeHost />
            </HeroUINativeProvider>
          </GestureHandlerRootView>
        </WebViewFetcherProvider>
      </SessionProvider>
    </QueryProvider>
  );
}
