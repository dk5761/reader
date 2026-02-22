import type { StyleProp, ViewStyle } from 'react-native';

export type WebtoonPage = {
  id: string;          // Unique identifier
  localPath: string;   // Local file path for native decode. Empty for placeholders/transitions.
  pageIndex: number;   // Relative page index in chapter. Use -1 for transition cells.
  chapterId: string;   // ID/Title of the chapter this page belongs to
  aspectRatio: number; // width / height 
  loadState?: "loading" | "ready" | "failed"; // Optional explicit page render state for native placeholders.
  errorMessage?: string; // Optional message for failed placeholder rendering.
  isTransition?: boolean; // If true, instructs native view to render the interstitial transition cell
  previousChapterTitle?: string; // Top row displayed in Transition cell
  nextChapterTitle?: string; // Bottom row displayed in Transition cell
  headers?: Record<string, string>; // Optional HTTP headers
};

export type OnChapterChangedEventPayload = {
  chapterId: string;
};

export type OnEndReachedEventPayload = {
  chapterId: string;
};

export type OnPageChangedEventPayload = {
  chapterId: string;
  pageIndex: number;
};

export type OnLoadingStateChangedEventPayload = {
  pageId: string;
  isLoading: boolean;
};

export type OnImageErrorEventPayload = {
  pageId: string;
  error: string;
};

export type OnRetryRequestedEventPayload = {
  pageId: string;
};

export type WebtoonReaderViewProps = {
  data: WebtoonPage[];
  onEndReached?: (event: { nativeEvent: OnEndReachedEventPayload }) => void;
  onChapterChanged?: (event: { nativeEvent: OnChapterChangedEventPayload }) => void;
  onSingleTap?: () => void;
  onPageChanged?: (event: { nativeEvent: OnPageChangedEventPayload }) => void;
  onScrollBegin?: () => void;
  onLoadingStateChanged?: (event: { nativeEvent: OnLoadingStateChangedEventPayload }) => void;
  onImageError?: (event: { nativeEvent: OnImageErrorEventPayload }) => void;
  onRetryRequested?: (event: { nativeEvent: OnRetryRequestedEventPayload }) => void;
  style?: StyleProp<ViewStyle>;
  ref?: React.Ref<any>;
};
