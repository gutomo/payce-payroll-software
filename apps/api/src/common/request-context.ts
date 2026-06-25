import { AsyncLocalStorage } from "node:async_hooks";

/** Per-request ambient context, propagated for logging and audit correlation. */
export interface RequestContext {
  requestId: string;
  ip?: string;
  tenantId?: string;
  userId?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}
