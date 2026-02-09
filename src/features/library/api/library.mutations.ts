import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateLibraryCategoryInput,
  UpdateLibraryViewSettingsInput,
} from "@/services/library";
import {
  bulkAssignCategories,
  bulkRemoveLibraryEntries,
  createLibraryCategory,
  deleteLibraryCategory,
  renameLibraryCategory,
  updateLibraryViewSettings,
} from "@/services/library";

const invalidateLibraryQueries = async (
  queryClient: ReturnType<typeof useQueryClient>
) => {
  await queryClient.invalidateQueries({
    queryKey: ["library"],
  });
};

export const useCreateLibraryCategoryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateLibraryCategoryInput) =>
      createLibraryCategory(input),
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
