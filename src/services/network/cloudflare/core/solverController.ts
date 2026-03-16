import type { CloudflareSolveRequest, CloudflareSolveResult } from "./types";
import { logReaderDiagnostic } from "@/services/diagnostics";

type SolverHandler = (
  request: CloudflareSolveRequest
) => Promise<CloudflareSolveResult>;

class CloudflareSolverController {
  private handler: SolverHandler | null = null;

  registerHandler(handler: SolverHandler): () => void {
    logReaderDiagnostic("cloudflare-solver", "handler registered");
    this.handler = handler;

    return () => {
      if (this.handler === handler) {
        logReaderDiagnostic("cloudflare-solver", "handler unregistered");
        this.handler = null;
      }
    };
  }

  async solve(request: CloudflareSolveRequest): Promise<CloudflareSolveResult> {
    if (!this.handler) {
      logReaderDiagnostic("cloudflare-solver", "solve requested without handler", {
        domain: request.domain,
        url: request.url,
        webViewUrl: request.webViewUrl,
      });
      return {
        success: false,
        mode: "none",
        reason: "solver_unavailable",
      };
    }

    logReaderDiagnostic("cloudflare-solver", "solve requested", {
      domain: request.domain,
      url: request.url,
      webViewUrl: request.webViewUrl,
      allowManualFallback: request.allowManualFallback,
      autoTimeoutMs: request.autoTimeoutMs,
      manualTimeoutMs: request.manualTimeoutMs,
      headerKeys: Object.keys(request.headers ?? {}),
      hasUserAgent: Boolean(request.userAgent),
    });

    try {
      const result = await this.handler(request);
      logReaderDiagnostic("cloudflare-solver", "solve finished", {
        domain: request.domain,
        url: request.url,
        success: result.success,
        mode: result.mode,
        reason: result.reason,
      });
      return result;
    } catch (error) {
      logReaderDiagnostic("cloudflare-solver", "solve threw error", {
        domain: request.domain,
        url: request.url,
        error,
      });
      throw error;
    }
  }
}

export const cloudflareSolverController = new CloudflareSolverController();
