import * as React from 'react';

import { WebtoonReaderViewProps } from './WebtoonReader.types';

export default function WebtoonReaderView(props: WebtoonReaderViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
