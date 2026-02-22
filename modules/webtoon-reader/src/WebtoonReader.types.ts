import type { StyleProp, ViewStyle } from 'react-native';

export type WebtoonReaderModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
};

export type ChangeEventPayload = {
  value: string;
};

export type WebtoonPage = {
  id: string;          // Unique identifier
  localPath: string;   // Local file path for native decode. Empty for placeholders/transitions.
  pageIndex: number;   // Relative page index in chapter. Use -1 for transition cells.
  chapterId: string;   // ID/Title of the chapter this page belongs to
  aspectRatio: number; // width / height 
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

export type WebtoonReaderViewProps = {
  data: WebtoonPage[];
  onEndReached?: (event: { nativeEvent: OnEndReachedEventPayload }) => void;
  onChapterChanged?: (event: { nativeEvent: OnChapterChangedEventPayload }) => void;
  onSingleTap?: () => void;
  onPageChanged?: (event: { nativeEvent: OnPageChangedEventPayload }) => void;
  onScrollBegin?: () => void;
  style?: StyleProp<ViewStyle>;
  ref?: React.Ref<any>;
};
