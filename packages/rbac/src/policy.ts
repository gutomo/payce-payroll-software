import type { PermissionKey } from "./permissions";

/** The resolved authorization principal for a request. */
export interface AccessSubject {
  /** Tenant the subject is acting within, or null for the platform plane. */
  tenantId: string | null;
  /** True for the platform principal (no tenant binding). */
  isPlatform: boolean;
  /** Effective, flattened permission set. */
  permissions: ReadonlySet<PermissionKey>;
}

export class ForbiddenError extends Error {
  constructor(public readonly required: PermissionKey) {
    super(`Missing required permission: ${required}`);
    this.name = "ForbiddenError";
  }
}

export class CrossTenantError extends Error {
  constructor() {
    super("Cross-tenant access denied");
    this.name = "CrossTenantError";
  }
}

/** Flatten role permission-key arrays into a single deduplicated permission set. */
export function collectPermissions(
  roles: ReadonlyArray<{ permissionKeys: ReadonlyArray<string> }>,
): Set<PermissionKey> {
  const set = new Set<PermissionKey>();
  for (const role of roles) {
    for (const key of role.permissionKeys) {
      set.add(key as PermissionKey);
    }
  }
  return set;
}

export function hasPermission(subject: AccessSubject, required: PermissionKey): boolean {
  return subject.permissions.has(required);
}

export function assertPermission(subject: AccessSubject, required: PermissionKey): void {
  if (!hasPermission(subject, required)) {
    throw new ForbiddenError(required);
  }
}

/** A tenant-scoped action requires the subject to be bound to exactly that tenant. */
export function assertSameTenant(subject: AccessSubject, tenantId: string): void {
  if (subject.isPlatform || subject.tenantId !== tenantId) {
    throw new CrossTenantError();
  }
}
