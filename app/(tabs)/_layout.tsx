import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="browse"
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: {
          backgroundColor: "#111214",
        },
        tabBarActiveTintColor: "#67A4FF",
        tabBarInactiveTintColor: "#8E8E93",
        tabBarStyle: {
          backgroundColor: "#141415",
          borderTopColor: "#2A2A2E",
        },
        tabBarIcon: ({ color, size }) => {
          const iconName =
            route.name === "library"
              ? "library-outline"
              : route.name === "browse"
                ? "compass-outline"
                : route.name === "settings"
                  ? "settings-outline"
                  : "ellipse-outline";

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tabs.Screen
        name="library"
        options={{
          title: "Library",
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: "Browse",
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
        }}
      />
    </Tabs>
  );
}
