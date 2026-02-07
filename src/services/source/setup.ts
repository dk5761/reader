import { sourceRegistry } from "./core";
import { builtInSourceAdapters } from "./sources";

let isSourceSystemInitialized = false;

export const initializeSourceSystem = (): void => {
  if (isSourceSystemInitialized) {
    return;
  }

  sourceRegistry.registerMany(builtInSourceAdapters);
  isSourceSystemInitialized = true;
};
