export type CloudflareSolveMode = "none" | "auto" | "manual";

export type CloudflareSolveFailureReason =
  | "solver_unavailable"
  | "auto_timeout"
  | "manual_timeout"
  | "manual_cancelled";

export interface CloudflareSolveRequest {
  url: string;
  domain: string;
  allowManualFallback: boolean;
  autoTimeoutMs: number;
  manualTimeoutMs: number;
}

export interface CloudflareSolveResult {
  success: boolean;
  mode: CloudflareSolveMode;
  reason?: CloudflareSolveFailureReason;
}

export interface CloudflareDetectionResult {
  isCloudflareChallenge: boolean;
  reasons: string[];
}
