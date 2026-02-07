import { isAxiosError } from "axios";

export interface ApiError {
  message: string;
  status: number | null;
  data?: unknown;
  isNetworkError: boolean;
}

export const toApiError = (error: unknown): ApiError => {
  if (isAxiosError(error)) {
    return {
      message: error.message,
      status: error.response?.status ?? null,
      data: error.response?.data,
      isNetworkError: !error.response,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      status: null,
      isNetworkError: false,
    };
  }

  return {
    message: "An unknown API error occurred.",
    status: null,
    data: error,
    isNetworkError: false,
  };
};
