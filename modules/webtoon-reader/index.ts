// Reexport the native module. On web, it will be resolved to WebtoonReaderModule.web.ts
// and on native platforms to WebtoonReaderModule.ts
export { default } from './src/WebtoonReaderModule';
export { default as WebtoonReaderView } from './src/WebtoonReaderView';
export * from  './src/WebtoonReader.types';
