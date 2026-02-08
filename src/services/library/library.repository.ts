import { and, desc, eq } from "drizzle-orm";
import { getDatabase, libraryEntries } from "@/services/db";
import type { LibraryEntry, UpsertLibraryEntryInput } from "./library.types";

const mapLibraryEntry = (entry: typeof libraryEntries.$inferSelect): LibraryEntry => ({
  id: entry.id,
  sourceId: entry.sourceId,
  mangaId: entry.mangaId,
  mangaUrl: entry.mangaUrl,
  title: entry.title,
  thumbnailUrl: entry.thumbnailUrl ?? undefined,
  description: entry.description ?? undefined,
  status: entry.status as LibraryEntry["status"],
  addedAt: entry.addedAt,
  updatedAt: entry.updatedAt,
  lastReadAt: entry.lastReadAt ?? undefined,
});

export const getLibraryEntries = (): LibraryEntry[] => {
  const db = getDatabase();
  const entries = db.select().from(libraryEntries).orderBy(desc(libraryEntries.updatedAt)).all();
  return entries.map(mapLibraryEntry);
};

export const getLibraryEntry = (
  sourceId: string,
  mangaId: string
): LibraryEntry | null => {
  const db = getDatabase();
  const entry = db
    .select()
    .from(libraryEntries)
    .where(and(eq(libraryEntries.sourceId, sourceId), eq(libraryEntries.mangaId, mangaId)))
    .limit(1)
    .get();

  return entry ? mapLibraryEntry(entry) : null;
};

export const upsertLibraryEntry = (input: UpsertLibraryEntryInput): void => {
  const db = getDatabase();
  const now = Date.now();

  db.insert(libraryEntries)
    .values({
      sourceId: input.sourceId,
      mangaId: input.mangaId,
      mangaUrl: input.mangaUrl ?? "",
      title: input.title,
      thumbnailUrl: input.thumbnailUrl,
      description: input.description,
      status: input.status,
      addedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [libraryEntries.sourceId, libraryEntries.mangaId],
      set: {
        mangaUrl: input.mangaUrl ?? "",
        title: input.title,
        thumbnailUrl: input.thumbnailUrl,
        description: input.description,
        status: input.status,
        updatedAt: now,
      },
    })
    .run();
};

export const removeLibraryEntry = (sourceId: string, mangaId: string): void => {
  const db = getDatabase();
  db.delete(libraryEntries)
    .where(and(eq(libraryEntries.sourceId, sourceId), eq(libraryEntries.mangaId, mangaId)))
    .run();
};
