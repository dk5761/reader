import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './WebtoonReader.types';

type WebtoonReaderModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class WebtoonReaderModule extends NativeModule<WebtoonReaderModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(WebtoonReaderModule, 'WebtoonReaderModule');
