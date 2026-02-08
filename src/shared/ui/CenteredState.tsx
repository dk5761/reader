import { Spinner } from "heroui-native";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

export interface CenteredStateProps {
  title?: string;
  message?: string;
  children?: ReactNode;
  withBackground?: boolean;
}

export const CenteredState = ({
  title,
  message,
  children,
  withBackground = true,
}: CenteredStateProps) => {
  return (
    <View
      className={`flex-1 items-center justify-center px-6 ${withBackground ? "bg-[#111214]" : ""}`}
    >
      {title ? <Text className="text-lg font-semibold text-white">{title}</Text> : null}
      {message ? (
        <Text className="mt-2 text-center text-sm text-[#9B9CA6]">{message}</Text>
      ) : null}
      {children}
    </View>
  );
};

export interface CenteredLoadingStateProps {
  message?: string;
  withBackground?: boolean;
}

export const CenteredLoadingState = ({
  message = "Loading...",
  withBackground = true,
}: CenteredLoadingStateProps) => {
  return (
    <CenteredState withBackground={withBackground}>
      <Spinner size="sm" color="#67A4FF" />
      <Text className="mt-3 text-sm text-[#9B9CA6]">{message}</Text>
    </CenteredState>
  );
};
