/**
 * Typed error thrown by the API client. Mirrors the API's error envelope `{ error: { code, message } }`
 * so callers branch on a stable `code` / `status` rather than parsing messages. Never carries PII.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}
