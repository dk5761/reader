export type AppUpdateStatus =
  | "idle"
  | "checking"
  | "downloading"
  | "ready"
  | "up_to_date"
  | "error";

export interface AppUpdateSnapshot {
  status: AppUpdateStatus;
  lastCheckedAt?: number;
  lastSuccessfulCheckAt?: number;
  errorMessage?: string;
  isUpdateReady: boolean;
  isChecking: boolean;
  isApplying: boolean;
}
