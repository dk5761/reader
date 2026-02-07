import axios from "axios";

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
export const API_TIMEOUT_MS = 15000;

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});
