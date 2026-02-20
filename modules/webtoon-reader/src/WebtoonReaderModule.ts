import { NativeModule, requireNativeModule } from 'expo';

import { WebtoonReaderModuleEvents } from './WebtoonReader.types';

declare class WebtoonReaderModule extends NativeModule<WebtoonReaderModuleEvents> {
  scrollToIndex(viewRef: any, chapterId: string, index: number): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<WebtoonReaderModule>('WebtoonReader');
