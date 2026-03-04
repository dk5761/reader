import {
  documentDirectory,
  EncodingType,
  getInfoAsync,
  makeDirectoryAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

type DiagnosticPayload = Record<string, unknown> | undefined;

type DiagnosticLogEntry = {
  timestamp: number;
  scope: string;
  message: string;
  payload?: DiagnosticPayload;
};

const DIAGNOSTICS_FOLDER = `${documentDirectory ?? ""}diagnostics/`;
const DIAGNOSTICS_LOG_FILE = `${DIAGNOSTICS_FOLDER}reader-diagnostics.jsonl`;
const FLUSH_DEBOUNCE_MS = 300;
const MEMORY_BUFFER_LIMIT = 4000;
const PERSISTED_RETENTION_MS = 12 * 60 * 60 * 1000;

let ensureDiagnosticsFolderPromise: Promise<void> | null = null;
let bufferedEntries: DiagnosticLogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let writeChain: Promise<void> = Promise.resolve();

const ensureDiagnosticsFolder = async (): Promise<void> => {
  if (!documentDirectory) {
    throw new Error("Document storage is not available on this device");
  }

  if (!ensureDiagnosticsFolderPromise) {
    ensureDiagnosticsFolderPromise = (async () => {
      const info = await getInfoAsync(DIAGNOSTICS_FOLDER);
      if (!info.exists) {
        await makeDirectoryAsync(DIAGNOSTICS_FOLDER, { intermediates: true });
      }
    })().catch((error) => {
      ensureDiagnosticsFolderPromise = null;
      throw error;
    });
  }

  return ensureDiagnosticsFolderPromise;
};

const sanitizePayload = (payload?: Record<string, unknown>): DiagnosticPayload => {
  if (!payload) {
    return undefined;
  }

  try {
    return JSON.parse(
      JSON.stringify(payload, (_key, value) => {
        if (value instanceof Error) {
          return {
            name: value.name,
            message: value.message,
          };
        }

        if (typeof value === "bigint") {
          return value.toString();
        }

        return value;
      }),
    ) as Record<string, unknown>;
  } catch (error) {
    return {
      serializationError: error instanceof Error ? error.message : "unknown",
    };
  }
};

const serializeEntries = (entries: DiagnosticLogEntry[]): string => {
  return entries.map((entry) => `${JSON.stringify(entry)}\n`).join("");
};

const queueWrite = (operation: () => Promise<void>): Promise<void> => {
  writeChain = writeChain
    .catch(() => undefined)
    .then(operation);

  return writeChain;
};

const parseStoredEntries = (content: string): DiagnosticLogEntry[] => {
  if (!content.trim()) {
    return [];
  }

  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as Partial<DiagnosticLogEntry>;
        if (
          typeof parsed.timestamp !== "number" ||
          typeof parsed.scope !== "string" ||
          typeof parsed.message !== "string"
        ) {
          return [];
        }

        return [{
          timestamp: parsed.timestamp,
          scope: parsed.scope,
          message: parsed.message,
          payload:
            parsed.payload && typeof parsed.payload === "object"
              ? (parsed.payload as Record<string, unknown>)
              : undefined,
        }];
      } catch {
        return [];
      }
    });
};

const readPersistedEntries = async (): Promise<DiagnosticLogEntry[]> => {
  await ensureDiagnosticsFolder();

  const info = await getInfoAsync(DIAGNOSTICS_LOG_FILE);
  if (!info.exists) {
    return [];
  }

  const content = await readAsStringAsync(DIAGNOSTICS_LOG_FILE, {
    encoding: EncodingType.UTF8,
  });

  return parseStoredEntries(content);
};

const rewritePersistedEntries = async (entries: DiagnosticLogEntry[]): Promise<void> => {
  await queueWrite(async () => {
    await ensureDiagnosticsFolder();
    await writeAsStringAsync(DIAGNOSTICS_LOG_FILE, serializeEntries(entries), {
      encoding: EncodingType.UTF8,
    });
  });
};

export const flushReaderDiagnostics = async (): Promise<void> => {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (bufferedEntries.length === 0) {
    await writeChain;
    return;
  }

  const entriesToWrite = bufferedEntries;
  bufferedEntries = [];

  await queueWrite(async () => {
    await ensureDiagnosticsFolder();
    await writeAsStringAsync(DIAGNOSTICS_LOG_FILE, serializeEntries(entriesToWrite), {
      encoding: EncodingType.UTF8,
      append: true,
    });
  });
};

const scheduleFlush = (): void => {
  if (flushTimer) {
    return;
  }

  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushReaderDiagnostics().catch((error) => {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.warn("[ReaderDiagnostics] flush failed", error);
      }
    });
  }, FLUSH_DEBOUNCE_MS);
};

export const logReaderDiagnostic = (
  scope: string,
  message: string,
  payload?: Record<string, unknown>,
): void => {
  bufferedEntries.push({
    timestamp: Date.now(),
    scope,
    message,
    payload: sanitizePayload(payload),
  });

  if (bufferedEntries.length > MEMORY_BUFFER_LIMIT) {
    bufferedEntries = bufferedEntries.slice(bufferedEntries.length - MEMORY_BUFFER_LIMIT);
  }

  scheduleFlush();
};

const formatExportContent = (entries: DiagnosticLogEntry[], hours: number): string => {
  const lines = [
    "Reader diagnostics export",
    `Generated: ${new Date().toISOString()}`,
    `Window: last ${hours} hour${hours === 1 ? "" : "s"}`,
    `Entries: ${entries.length}`,
    "",
  ];

  if (entries.length === 0) {
    lines.push("No diagnostics were captured in the selected window.");
    return lines.join("\n");
  }

  entries
    .sort((left, right) => left.timestamp - right.timestamp)
    .forEach((entry) => {
      const payloadText = entry.payload ? ` ${JSON.stringify(entry.payload)}` : "";
      lines.push(
        `[${new Date(entry.timestamp).toISOString()}] ${entry.scope} ${entry.message}${payloadText}`,
      );
    });

  return lines.join("\n");
};

export const exportRecentReaderDiagnostics = async (hours = 3): Promise<string> => {
  const normalizedHours = Math.max(1, Math.floor(hours));
  const cutoff = Date.now() - (normalizedHours * 60 * 60 * 1000);
  const retentionCutoff = Date.now() - PERSISTED_RETENTION_MS;

  await flushReaderDiagnostics();

  const persistedEntries = await readPersistedEntries();
  const retainedEntries = persistedEntries.filter((entry) => entry.timestamp >= retentionCutoff);

  if (retainedEntries.length !== persistedEntries.length) {
    await rewritePersistedEntries(retainedEntries);
  }

  const exportEntries = retainedEntries.filter((entry) => entry.timestamp >= cutoff);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const exportPath = `${DIAGNOSTICS_FOLDER}reader-diagnostics-${timestamp}.log`;

  await ensureDiagnosticsFolder();
  await writeAsStringAsync(exportPath, formatExportContent(exportEntries, normalizedHours), {
    encoding: EncodingType.UTF8,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(exportPath, {
      mimeType: "text/plain",
      dialogTitle: "Share Reader Diagnostics",
      UTI: "public.plain-text",
    });
  }

  return exportPath;
};
