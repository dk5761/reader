import { Platform } from "react-native";

const IOS_SAFARI_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1";

const ANDROID_CHROME_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36";

export const DEFAULT_BROWSER_USER_AGENT =
  Platform.OS === "ios" ? IOS_SAFARI_USER_AGENT : ANDROID_CHROME_USER_AGENT;
