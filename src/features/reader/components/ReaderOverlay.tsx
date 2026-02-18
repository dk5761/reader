import { View, Text, StyleSheet } from "react-native";
import { router } from "expo-router";
import { BackButton } from "@/shared/ui";

interface ReaderOverlayProps {
  chapterId: string;
  chapterNumber?: number;
  chapterTitle?: string;
}

export function ReaderOverlay({ chapterId, chapterNumber, chapterTitle }: ReaderOverlayProps) {
  const displayTitle = chapterTitle || (chapterNumber ? `Chapter ${chapterNumber}` : chapterId);

  return (
    <View style={styles.container}>
      <BackButton
        onPress={() => router.back()}
        variant="pill"
        label="Back"
      />
      <Text style={styles.title}>{displayTitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    zIndex: 100,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
