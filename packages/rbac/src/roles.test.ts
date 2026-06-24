import { describe, expect, it } from "vitest";
import { ALL_PERMISSION_KEYS, PERMISSIONS } from "./permissions";
import { ROLES, TENANT_SYSTEM_ROLES } from "./roles";

describe("TENANT_SYSTEM_ROLES", () => {
  it("does not seed the platform-only super_admin role into tenants", () => {
    expect(TENANT_SYSTEM_ROLES.map((r) => r.key)).not.toContain(ROLES.SUPER_ADMIN);
  });

  it("grants tenant_admin the user-invite permission", () => {
    const admin = TENANT_SYSTEM_ROLES.find((r) => r.key === ROLES.TENANT_ADMIN);
    expect(admin?.permissions).toContain(PERMISSIONS.IDENTITY_USER_INVITE);
  });

  it("limits employee to self.read only", () => {
    const employee = TENANT_SYSTEM_ROLES.find((r) => r.key === ROLES.EMPLOYEE);
    expect(employee?.permissions).toEqual([PERMISSIONS.SELF_READ]);
  });

  it("only references permissions that exist in the catalog", () => {
    for (const role of TENANT_SYSTEM_ROLES) {
      for (const perm of role.permissions) {
        expect(ALL_PERMISSION_KEYS).toContain(perm);
      }
    }
  });
});
