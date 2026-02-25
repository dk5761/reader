import { registerWebModule, NativeModule } from 'expo';

class WebtoonReaderModule extends NativeModule<Record<string, never>> {
  async scrollToIndex(_viewRef: any, _chapterId: string, _index: number): Promise<void> {
    return;
  }

  async getCurrentPosition(_viewRef: any): Promise<{ chapterId: string; pageIndex: number }> {
    return { chapterId: '', pageIndex: -1 };
  }

  async setZoomScale(_viewRef: any, _scale: number): Promise<void> {
    return;
  }

  async resetZoom(_viewRef: any): Promise<void> {
    return;
  }

  async resetSession(_viewRef: any): Promise<void> {
    return;
  }
}

export default registerWebModule(WebtoonReaderModule, 'WebtoonReaderModule');
