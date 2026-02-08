import type { SourceAdapter } from "../core";
import { asuraScansAdapter } from "./asurascans";
import { comixAdapter } from "./comix";
import { manhwa18Adapter } from "./manhwa18";

export const builtInSourceAdapters: SourceAdapter[] = [
  asuraScansAdapter,
  comixAdapter,
  manhwa18Adapter,
];
