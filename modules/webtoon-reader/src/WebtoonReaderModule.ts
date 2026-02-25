import { NativeModule, requireNativeModule } from 'expo';

declare class WebtoonReaderModule extends NativeModule<Record<string, never>> {
  scrollToIndex(viewRef: any, chapterId: string, index: number): Promise<void>;
  getCurrentPosition(viewRef: any): Promise<{ chapterId: string; pageIndex: number }>;
  setZoomScale(viewRef: any, scale: number): Promise<void>;
  resetZoom(viewRef: any): Promise<void>;
  resetSession(viewRef: any): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<WebtoonReaderModule>('WebtoonReader');
