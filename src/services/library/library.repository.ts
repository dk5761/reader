import {
  and,
  asc,
  desc,
  eq,
  inArray,
} from "drizzle-orm";
import {
  getDatabase,
  libraryCategories,
  libraryEntries,
  libraryEntryCategories,
  libraryViewSettings,
} from "@/services/db";
import type {
  CreateLibraryCategoryInput,
  LibraryActiveCategoryFilter,
  LibraryCategory,
  LibraryEntry,
  LibraryEntryWithCategories,
  LibraryFilterInput,
  LibrarySortDirection,
  LibrarySortKey,
  LibraryStatusFilter,
  LibraryViewSettings,
  UpdateLibraryViewSettingsInput,
  UpsertLibraryEntryInput,
} from "./library.types";

const LIBRARY_VIEW_SETTINGS_SINGLETON_ID = 1;

const KNOWN_STATUS_VALUES = new Set(["ongoing", "completed", "hiatus"]);

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

const mapLibraryCategory = (
  category: typeof libraryCategories.$inferSelect
): LibraryCategory => ({
  id: category.id,
  name: category.name,
  position: category.position,
  createdAt: category.createdAt,
  updatedAt: category.updatedAt,
});

const normalizeCategoryName = (value: string): string => value.trim();

const normalizeCategoryNameKey = (value: string): string =>
  normalizeCategoryName(value).toLowerCase();

const normalizeSortKey = (value: string | null | undefined): LibrarySortKey => {
  if (value === "title" || value === "updatedAt" || value === "addedAt" || value === "lastReadAt") {
    return value;
  }
  return "updatedAt";
};

const normalizeSortDirection = (
  value: string | null | undefined
): LibrarySortDirection => (value === "asc" || value === "desc" ? value : "desc");

const normalizeStatusFilter = (
  value: string | null | undefined
): LibraryStatusFilter =>
  value === "ongoing" ||
  value === "completed" ||
  value === "hiatus" ||
  value === "unknown"
    ? value
    : "all";

const parseSourceFilterJson = (rawValue: string | null | undefined): string[] => {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return Array.from(
      new Set(
        parsed
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter(Boolean)
      )
    );
  } catch {
    return [];
  }
};

const ensureLibraryViewSettingsRow = (): void => {
  const db = getDatabase();
  const now = Date.now();

  db.insert(libraryViewSettings)
    .values({
      id: LIBRARY_VIEW_SETTINGS_SINGLETON_ID,
      activeCategoryId: null,
      sortKey: "updatedAt",
      sortDirection: "desc",
      statusFilter: "all",
      sourceFilterJson: "[]",
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: libraryViewSettings.id,
    })
    .run();
};

const mapLibraryViewSettings = (
  row: typeof libraryViewSettings.$inferSelect
): LibraryViewSettings => ({
  activeCategoryId: row.activeCategoryId ?? null,
  sortKey: normalizeSortKey(row.sortKey),
  sortDirection: normalizeSortDirection(row.sortDirection),
  statusFilter: normalizeStatusFilter(row.statusFilter),
  sourceFilterSourceIds: parseSourceFilterJson(row.sourceFilterJson),
  updatedAt: row.updatedAt,
});

const isUnknownStatus = (status: string | undefined): boolean => {
  if (!status) {
    return true;
  }

  return !KNOWN_STATUS_VALUES.has(status);
};

const compareEntries = (
  a: LibraryEntryWithCategories,
  b: LibraryEntryWithCategories,
  sortKey: LibrarySortKey,
  sortDirection: LibrarySortDirection
): number => {
  let result = 0;

  if (sortKey === "title") {
    result = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  } else if (sortKey === "addedAt") {
    result = a.addedAt - b.addedAt;
  } else if (sortKey === "lastReadAt") {
    result = (a.lastReadAt ?? -1) - (b.lastReadAt ?? -1);
  } else {
    result = a.updatedAt - b.updatedAt;
  }

  if (result === 0) {
    result = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  }

  return sortDirection === "asc" ? result : -result;
};

const normalizeCategoryIds = (categoryIds: number[]): number[] =>
  Array.from(
    new Set(
      categoryIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  );

const normalizeEntryIds = (entryIds: number[]): number[] =>
  Array.from(
    new Set(
      entryIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  );

export const getLibraryEntries = (): LibraryEntry[] => {
  return getLibraryEntriesWithCategories({
    activeCategory: "all",
    statusFilter: "all",
    sortKey: "updatedAt",
    sortDirection: "desc",
    sourceIds: [],
  }).map(({ categoryIds: _categoryIds, ...entry }) => entry);
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

export const getLibraryCategories = (): LibraryCategory[] => {
  const db = getDatabase();
  const categories = db
    .select()
    .from(libraryCategories)
    .orderBy(asc(libraryCategories.position))
    .all();

  return categories.map(mapLibraryCategory);
};

export const createLibraryCategory = (
  input: CreateLibraryCategoryInput
): LibraryCategory => {
  const db = getDatabase();
  const now = Date.now();
  const name = normalizeCategoryName(input.name);
  const normalizedName = normalizeCategoryNameKey(input.name);

  if (!name) {
    throw new Error("Category name cannot be empty.");
  }

  const lastCategory = db
    .select()
    .from(libraryCategories)
    .orderBy(desc(libraryCategories.position))
    .limit(1)
    .get();

  const nextPosition = (lastCategory?.position ?? -1) + 1;

  db.insert(libraryCategories)
    .values({
      name,
      normalizedName,
      position: nextPosition,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const category = db
    .select()
    .from(libraryCategories)
    .where(eq(libraryCategories.normalizedName, normalizedName))
    .limit(1)
    .get();

  if (!category) {
    throw new Error("Could not create category.");
  }

  return mapLibraryCategory(category);
};

export const renameLibraryCategory = (id: number, name: string): void => {
  const db = getDatabase();
  const normalized = normalizeCategoryName(name);
  const normalizedName = normalizeCategoryNameKey(name);
  const now = Date.now();

  if (!normalized) {
    throw new Error("Category name cannot be empty.");
  }

  db.update(libraryCategories)
    .set({
      name: normalized,
      normalizedName,
      updatedAt: now,
    })
    .where(eq(libraryCategories.id, id))
    .run();
};

export const reorderLibraryCategories = (categoryIdsInOrder: number[]): void => {
  const db = getDatabase();
  const normalizedIds = normalizeCategoryIds(categoryIdsInOrder);

  db.transaction((tx) => {
    normalizedIds.forEach((categoryId, index) => {
      tx.update(libraryCategories)
        .set({
          position: index,
          updatedAt: Date.now(),
        })
        .where(eq(libraryCategories.id, categoryId))
        .run();
    });
  });
};

export const deleteLibraryCategory = (
  categoryId: number,
  options?: { moveEntriesToCategoryId?: number | null }
): void => {
  const db = getDatabase();
  const moveTargetCategoryId = options?.moveEntriesToCategoryId ?? null;
  const now = Date.now();

  db.transaction((tx) => {
    const affectedRelations = tx
      .select({ libraryEntryId: libraryEntryCategories.libraryEntryId })
      .from(libraryEntryCategories)
      .where(eq(libraryEntryCategories.categoryId, categoryId))
      .all();

    if (moveTargetCategoryId && moveTargetCategoryId !== categoryId) {
      affectedRelations.forEach((relation) => {
        tx.insert(libraryEntryCategories)
          .values({
            libraryEntryId: relation.libraryEntryId,
            categoryId: moveTargetCategoryId,
            createdAt: now,
          })
          .onConflictDoNothing({
            target: [
              libraryEntryCategories.libraryEntryId,
              libraryEntryCategories.categoryId,
            ],
          })
          .run();
      });
    }

    tx.delete(libraryEntryCategories)
      .where(eq(libraryEntryCategories.categoryId, categoryId))
      .run();

    tx.delete(libraryCategories).where(eq(libraryCategories.id, categoryId)).run();

    const remaining = tx
      .select()
      .from(libraryCategories)
      .orderBy(asc(libraryCategories.position))
      .all();

    remaining.forEach((category, index) => {
      tx.update(libraryCategories)
        .set({
          position: index,
          updatedAt: now,
        })
        .where(eq(libraryCategories.id, category.id))
        .run();
    });
  });
};

export const getEntryCategoryIds = (libraryEntryId: number): number[] => {
  const db = getDatabase();
  return db
    .select({ categoryId: libraryEntryCategories.categoryId })
    .from(libraryEntryCategories)
    .where(eq(libraryEntryCategories.libraryEntryId, libraryEntryId))
    .all()
    .map((entry) => entry.categoryId);
};

export const setEntryCategories = (
  libraryEntryId: number,
  categoryIds: number[]
): void => {
  const db = getDatabase();
  const now = Date.now();
  const normalizedCategoryIds = normalizeCategoryIds(categoryIds);

  db.transaction((tx) => {
    tx.delete(libraryEntryCategories)
      .where(eq(libraryEntryCategories.libraryEntryId, libraryEntryId))
      .run();

    normalizedCategoryIds.forEach((categoryId) => {
      tx.insert(libraryEntryCategories)
        .values({
          libraryEntryId,
          categoryId,
          createdAt: now,
        })
        .onConflictDoNothing({
          target: [
            libraryEntryCategories.libraryEntryId,
            libraryEntryCategories.categoryId,
          ],
        })
        .run();
    });
  });
};

export const addEntryToCategory = (libraryEntryId: number, categoryId: number): void => {
  const db = getDatabase();
  db.insert(libraryEntryCategories)
    .values({
      libraryEntryId,
      categoryId,
      createdAt: Date.now(),
    })
    .onConflictDoNothing({
      target: [libraryEntryCategories.libraryEntryId, libraryEntryCategories.categoryId],
    })
    .run();
};

export const removeEntryFromCategory = (
  libraryEntryId: number,
  categoryId: number
): void => {
  const db = getDatabase();
  db.delete(libraryEntryCategories)
    .where(
      and(
        eq(libraryEntryCategories.libraryEntryId, libraryEntryId),
        eq(libraryEntryCategories.categoryId, categoryId)
      )
    )
    .run();
};

export const getLibraryEntriesWithCategories = (
  params: LibraryFilterInput = {}
): LibraryEntryWithCategories[] => {
  const db = getDatabase();
  const activeCategory: LibraryActiveCategoryFilter = params.activeCategory ?? "all";
  const sortKey = params.sortKey ?? "updatedAt";
  const sortDirection = params.sortDirection ?? "desc";
  const statusFilter = params.statusFilter ?? "all";
  const sourceIds = params.sourceIds ?? [];

  const entries = db.select().from(libraryEntries).all();
  const relations = db.select().from(libraryEntryCategories).all();

  const categoryIdsByEntryId = new Map<number, number[]>();
  relations.forEach((relation) => {
    const existing = categoryIdsByEntryId.get(relation.libraryEntryId) ?? [];
    existing.push(relation.categoryId);
    categoryIdsByEntryId.set(relation.libraryEntryId, existing);
  });

  const sourceIdSet = new Set(sourceIds);
  const withCategories = entries.map((entry) => ({
    ...mapLibraryEntry(entry),
    categoryIds: categoryIdsByEntryId.get(entry.id) ?? [],
  }));

  const filtered = withCategories.filter((entry) => {
    if (sourceIdSet.size > 0 && !sourceIdSet.has(entry.sourceId)) {
      return false;
    }

    if (statusFilter !== "all") {
      const status = entry.status?.toLowerCase();
      if (statusFilter === "unknown") {
        if (!isUnknownStatus(status)) {
          return false;
        }
      } else if (status !== statusFilter) {
        return false;
      }
    }

    if (activeCategory === "all") {
      return true;
    }

    if (activeCategory === "uncategorized") {
      return entry.categoryIds.length === 0;
    }

    return entry.categoryIds.includes(activeCategory);
  });

  filtered.sort((a, b) => compareEntries(a, b, sortKey, sortDirection));
  return filtered;
};

export const getLibraryViewSettings = (): LibraryViewSettings => {
  const db = getDatabase();
  ensureLibraryViewSettingsRow();

  const row = db
    .select()
    .from(libraryViewSettings)
    .where(eq(libraryViewSettings.id, LIBRARY_VIEW_SETTINGS_SINGLETON_ID))
    .limit(1)
    .get();

  if (!row) {
    const fallbackNow = Date.now();
    return {
      activeCategoryId: null,
      sortKey: "updatedAt",
      sortDirection: "desc",
      statusFilter: "all",
      sourceFilterSourceIds: [],
      updatedAt: fallbackNow,
    };
  }

  return mapLibraryViewSettings(row);
};

export const updateLibraryViewSettings = (
  input: UpdateLibraryViewSettingsInput
): LibraryViewSettings => {
  const db = getDatabase();
  const current = getLibraryViewSettings();
  const nextSortKey = input.sortKey ?? current.sortKey;
  const nextSortDirection = input.sortDirection ?? current.sortDirection;
  const nextStatusFilter = input.statusFilter ?? current.statusFilter;
  const nextSourceFilterSourceIds = input.sourceFilterSourceIds ?? current.sourceFilterSourceIds;
  const nextActiveCategoryId =
    input.activeCategoryId === undefined ? current.activeCategoryId : input.activeCategoryId;

  db.update(libraryViewSettings)
    .set({
      activeCategoryId: nextActiveCategoryId,
      sortKey: normalizeSortKey(nextSortKey),
      sortDirection: normalizeSortDirection(nextSortDirection),
      statusFilter: normalizeStatusFilter(nextStatusFilter),
      sourceFilterJson: JSON.stringify(
        Array.from(
          new Set(
            nextSourceFilterSourceIds
              .map((sourceId) => sourceId.trim())
              .filter(Boolean)
          )
        )
      ),
      updatedAt: Date.now(),
    })
    .where(eq(libraryViewSettings.id, LIBRARY_VIEW_SETTINGS_SINGLETON_ID))
    .run();

  return getLibraryViewSettings();
};

export const bulkAssignCategories = (params: {
  libraryEntryIds: number[];
  categoryIdsToAdd: number[];
  categoryIdsToRemove: number[];
}): void => {
  const db = getDatabase();
  const entryIds = normalizeEntryIds(params.libraryEntryIds);
  const addIds = normalizeCategoryIds(params.categoryIdsToAdd);
  const removeIds = normalizeCategoryIds(params.categoryIdsToRemove);
  const now = Date.now();

  if (entryIds.length === 0) {
    return;
  }

  db.transaction((tx) => {
    if (removeIds.length > 0) {
      tx.delete(libraryEntryCategories)
        .where(
          and(
            inArray(libraryEntryCategories.libraryEntryId, entryIds),
            inArray(libraryEntryCategories.categoryId, removeIds)
          )
        )
        .run();
    }

    if (addIds.length > 0) {
      entryIds.forEach((libraryEntryId) => {
        addIds.forEach((categoryId) => {
          tx.insert(libraryEntryCategories)
            .values({
              libraryEntryId,
              categoryId,
              createdAt: now,
            })
            .onConflictDoNothing({
              target: [
                libraryEntryCategories.libraryEntryId,
                libraryEntryCategories.categoryId,
              ],
            })
            .run();
        });
      });
    }
  });
};

export const bulkRemoveLibraryEntries = (libraryEntryIds: number[]): void => {
  const db = getDatabase();
  const entryIds = normalizeEntryIds(libraryEntryIds);

  if (entryIds.length === 0) {
    return;
  }

  db.transaction((tx) => {
    tx.delete(libraryEntryCategories)
      .where(inArray(libraryEntryCategories.libraryEntryId, entryIds))
      .run();

    tx.delete(libraryEntries).where(inArray(libraryEntries.id, entryIds)).run();
  });
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
  const entry = db
    .select({ id: libraryEntries.id })
    .from(libraryEntries)
    .where(and(eq(libraryEntries.sourceId, sourceId), eq(libraryEntries.mangaId, mangaId)))
    .limit(1)
    .get();

  if (!entry) {
    return;
  }

  db.transaction((tx) => {
    tx.delete(libraryEntryCategories)
      .where(eq(libraryEntryCategories.libraryEntryId, entry.id))
      .run();

    tx.delete(libraryEntries)
      .where(and(eq(libraryEntries.sourceId, sourceId), eq(libraryEntries.mangaId, mangaId)))
      .run();
  });
};
