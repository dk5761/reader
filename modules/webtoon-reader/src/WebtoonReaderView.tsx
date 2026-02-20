import { requireNativeView } from 'expo';
import * as React from 'react';

import { WebtoonReaderViewProps } from './WebtoonReader.types';

const NativeView: React.ComponentType<WebtoonReaderViewProps> =
  requireNativeView('WebtoonReader');

export default function WebtoonReaderView(props: WebtoonReaderViewProps) {
  return <NativeView {...props} />;
}
