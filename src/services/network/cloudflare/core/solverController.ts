import type { CloudflareSolveRequest, CloudflareSolveResult } from "./types";

type SolverHandler = (
  request: CloudflareSolveRequest
) => Promise<CloudflareSolveResult>;

class CloudflareSolverController {
  private handler: SolverHandler | null = null;

  registerHandler(handler: SolverHandler): () => void {
    this.handler = handler;

    return () => {
      if (this.handler === handler) {
        this.handler = null;
      }
    };
  }

  async solve(request: CloudflareSolveRequest): Promise<CloudflareSolveResult> {
    if (!this.handler) {
      return {
        success: false,
        mode: "none",
        reason: "solver_unavailable",
      };
    }

    return this.handler(request);
  }
}

export const cloudflareSolverController = new CloudflareSolverController();
