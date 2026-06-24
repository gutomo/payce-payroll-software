import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "./permissions";
import {
  assertPermission,
  assertSameTenant,
  collectPermissions,
  CrossTenantError,
  ForbiddenError,
  hasPermission,
  type AccessSubject,
} from "./policy";

function subject(
  perms: string[],
  tenantId: string | null = "t1",
  isPlatform = false,
): AccessSubject {
  return { tenantId, isPlatform, permissions: new Set(perms as never[]) };
}

describe("collectPermissions", () => {
  it("flattens and deduplicates permission keys across roles", () => {
    const set = collectPermissions([
      { permissionKeys: [PERMISSIONS.SELF_READ, PERMISSIONS.AUDIT_READ] },
      { permissionKeys: [PERMISSIONS.SELF_READ, PERMISSIONS.IDENTITY_USER_READ] },
    ]);
    expect([...set].sort()).toEqual(
      [PERMISSIONS.AUDIT_READ, PERMISSIONS.IDENTITY_USER_READ, PERMISSIONS.SELF_READ].sort(),
    );
  });
});

describe("permission checks", () => {
  it("grants when the permission is present", () => {
    expect(hasPermission(subject([PERMISSIONS.SELF_READ]), PERMISSIONS.SELF_READ)).toBe(true);
  });

  it("denies when the permission is absent", () => {
    expect(hasPermission(subject([PERMISSIONS.SELF_READ]), PERMISSIONS.AUDIT_READ)).toBe(false);
  });

  it("assertPermission throws ForbiddenError when missing", () => {
    expect(() => assertPermission(subject([]), PERMISSIONS.AUDIT_READ)).toThrow(ForbiddenError);
  });
});

describe("assertSameTenant", () => {
  it("passes for a matching tenant", () => {
    expect(() => assertSameTenant(subject([], "t1"), "t1")).not.toThrow();
  });

  it("blocks a mismatched tenant", () => {
    expect(() => assertSameTenant(subject([], "t1"), "t2")).toThrow(CrossTenantError);
  });

  it("blocks the platform principal from tenant-scoped actions", () => {
    expect(() => assertSameTenant(subject([], null, true), "t1")).toThrow(CrossTenantError);
  });
});
