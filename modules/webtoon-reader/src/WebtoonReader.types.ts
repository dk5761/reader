import type { StyleProp, ViewStyle } from 'react-native';

export type WebtoonReaderModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
};

export type ChangeEventPayload = {
  value: string;
};

export type WebtoonPage = {
  id: string;          // Unique identifier
  url: string;         // Remote image URL. Can be empty if isTransition is true.
  chapterId: string;   // ID/Title of the chapter this page belongs to
  aspectRatio: number; // width / height 
  isTransition?: boolean; // If true, instructs native view to render the interstitial transition cell
  previousChapterTitle?: string; // Top row displayed in Transition cell
  nextChapterTitle?: string; // Bottom row displayed in Transition cell
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
  style?: StyleProp<ViewStyle>;
  ref?: React.Ref<any>;
};
