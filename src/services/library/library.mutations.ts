import { useMutation, useQueryClient } from "@tanstack/react-query";
import { libraryQueryFactory } from "./library.queryFactory";
import {
  addEntryToCategory,
  bulkAssignCategories,
  bulkRemoveLibraryEntries,
  createLibraryCategory,
  deleteLibraryCategory,
  removeEntryFromCategory,
  removeLibraryEntry,
  renameLibraryCategory,
  reorderLibraryCategories,
  setEntryCategories,
  updateLibraryViewSettings,
  upsertLibraryEntry,
} from "./library.repository";
import type {
  CreateLibraryCategoryInput,
  UpdateLibraryViewSettingsInput,
  UpsertLibraryEntryInput,
} from "./library.types";

const invalidateLibraryQueries = async (
  queryClient: ReturnType<typeof useQueryClient>
) => {
  await queryClient.invalidateQueries({ queryKey: libraryQueryFactory.all() });
};

export const useUpsertLibraryEntryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpsertLibraryEntryInput) => {
      upsertLibraryEntry(input);
    },
    onSuccess: async () => {
      await invalidateLibraryQueries(queryClient);
    },
  });
};

export const useRemoveLibraryEntryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { sourceId: string; mangaId: string }) => {
      removeLibraryEntry(input.sourceId, input.mangaId);
    },
    onSuccess: async () => {
      await invalidateLibraryQueries(queryClient);
    },
  });
};

export const useCreateLibraryCategoryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateLibraryCategoryInput) => createLibraryCategory(input),
    onSuccess: async () => {
      await invalidateLibraryQueries(queryClient);
    },
  });
};

export const useRenameLibraryCategoryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { categoryId: number; name: string }) =>
      renameLibraryCategory(input.categoryId, input.name),
    onSuccess: async () => {
      await invalidateLibraryQueries(queryClient);
    },
  });
};

export const useReorderLibraryCategoriesMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (categoryIdsInOrder: number[]) =>
      reorderLibraryCategories(categoryIdsInOrder),
    onSuccess: async () => {
      await invalidateLibraryQueries(queryClient);
    },
  });
};

export const useDeleteLibraryCategoryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      categoryId: number;
      moveEntriesToCategoryId?: number | null;
    }) => deleteLibraryCategory(input.categoryId, input),
    onSuccess: async () => {
      await invalidateLibraryQueries(queryClient);
    },
  });
};

export const useSetEntryCategoriesMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { libraryEntryId: number; categoryIds: number[] }) =>
      setEntryCategories(input.libraryEntryId, input.categoryIds),
    onSuccess: async () => {
      await invalidateLibraryQueries(queryClient);
    },
  });
};

export const useAddEntryToCategoryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { libraryEntryId: number; categoryId: number }) =>
      addEntryToCategory(input.libraryEntryId, input.categoryId),
    onSuccess: async () => {
      await invalidateLibraryQueries(queryClient);
    },
  });
};

export const useRemoveEntryFromCategoryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { libraryEntryId: number; categoryId: number }) =>
      removeEntryFromCategory(input.libraryEntryId, input.categoryId),
    onSuccess: async () => {
      await invalidateLibraryQueries(queryClient);
    },
  });
};

export const useUpdateLibraryViewSettingsMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateLibraryViewSettingsInput) =>
      updateLibraryViewSettings(input),
    onSuccess: async () => {
      await invalidateLibraryQueries(queryClient);
    },
  });
};

export const useBulkAssignCategoriesMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      libraryEntryIds: number[];
      categoryIdsToAdd: number[];
      categoryIdsToRemove: number[];
    }) => bulkAssignCategories(input),
    onSuccess: async () => {
      await invalidateLibraryQueries(queryClient);
    },
  });
};

export const useBulkRemoveLibraryEntriesMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (libraryEntryIds: number[]) =>
      bulkRemoveLibraryEntries(libraryEntryIds),
    onSuccess: async () => {
      await invalidateLibraryQueries(queryClient);
    },
  });
};
