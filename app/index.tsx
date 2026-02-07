import { Button } from "heroui-native";
import { Text, View } from "react-native";

export default function Index() {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
      <Text className="text-center text-lg text-foreground">
        Uniwind + HeroUI Native are configured.
      </Text>
      <Button>
        <Button.Label>Continue</Button.Label>
      </Button>
    </View>
  );
}
