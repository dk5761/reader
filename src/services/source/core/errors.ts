import { isAxiosError } from "axios";

class SourceSystemError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "SourceSystemError";
  }
}

export class SourceAlreadyRegisteredError extends SourceSystemError {
  constructor(sourceId: string) {
    super(
      `Source with id "${sourceId}" is already registered in the source registry.`,
      "SOURCE_ALREADY_REGISTERED"
    );
    this.name = "SourceAlreadyRegisteredError";
  }
}

export class SourceNotFoundError extends SourceSystemError {
  constructor(sourceId: string) {
    super(
      `Source with id "${sourceId}" is not registered.`,
      "SOURCE_NOT_FOUND"
    );
    this.name = "SourceNotFoundError";
  }
}

export class SourceCapabilityError extends SourceSystemError {
  constructor(sourceId: string, capability: string) {
    super(
      `Source "${sourceId}" does not support capability "${capability}".`,
      "SOURCE_CAPABILITY_NOT_SUPPORTED"
    );
    this.name = "SourceCapabilityError";
  }
}

export class SourceRequestError extends SourceSystemError {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly data: unknown,
    public readonly isNetworkError: boolean
  ) {
    super(message, "SOURCE_REQUEST_FAILED");
    this.name = "SourceRequestError";
  }
}

export const toSourceRequestError = (error: unknown): SourceRequestError => {
  if (isAxiosError(error)) {
    return new SourceRequestError(
      error.message,
      error.response?.status ?? null,
      error.response?.data,
      !error.response
    );
  }

  if (error instanceof SourceRequestError) {
    return error;
  }

  if (error instanceof Error) {
    return new SourceRequestError(error.message, null, undefined, false);
  }

  return new SourceRequestError(
    "An unknown source request error occurred.",
    null,
    error,
    false
  );
};
