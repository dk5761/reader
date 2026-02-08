import type { SourceAdapter } from "../core";
import { asuraScansAdapter } from "./asurascans";

export const builtInSourceAdapters: SourceAdapter[] = [asuraScansAdapter];
