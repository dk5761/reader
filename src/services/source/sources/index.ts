import type { SourceAdapter } from "../core";
import { asuraScansAdapter } from "./asurascans";
import { comixAdapter } from "./comix";

export const builtInSourceAdapters: SourceAdapter[] = [
  asuraScansAdapter,
  comixAdapter,
];
