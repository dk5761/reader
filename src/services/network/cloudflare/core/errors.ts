class CloudflareError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "CloudflareError";
  }
}

export class CloudflareRetryLimitExceededError extends CloudflareError {
  constructor(domain: string, attempts: number) {
    super(
      `Cloudflare challenge retry limit exceeded for ${domain}. Attempts: ${attempts}.`,
      "CF_RETRY_LIMIT_EXCEEDED"
    );
    this.name = "CloudflareRetryLimitExceededError";
  }
}

export class CloudflareSolveFailedError extends CloudflareError {
  constructor(domain: string, reason: string) {
    super(
      `Cloudflare challenge solve failed for ${domain}. Reason: ${reason}.`,
      "CF_SOLVE_FAILED"
    );
    this.name = "CloudflareSolveFailedError";
  }
}

export class CloudflareClearanceMissingError extends CloudflareError {
  constructor(domain: string) {
    super(
      `Cloudflare solve completed but cf_clearance is missing for ${domain}.`,
      "CF_CLEARANCE_MISSING"
    );
    this.name = "CloudflareClearanceMissingError";
  }
}
