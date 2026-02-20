import { NativeModule, requireNativeModule } from 'expo';

import { WebtoonReaderModuleEvents } from './WebtoonReader.types';

declare class WebtoonReaderModule extends NativeModule<WebtoonReaderModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<WebtoonReaderModule>('WebtoonReader');
