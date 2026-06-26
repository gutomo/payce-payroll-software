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

  it("limits employee to self-service permissions (no manage/approve)", () => {
    const employee = TENANT_SYSTEM_ROLES.find((r) => r.key === ROLES.EMPLOYEE);
    expect(employee?.permissions).toEqual([
      PERMISSIONS.ORG_LEAVE_READ,
      PERMISSIONS.ORG_LEAVE_REQUEST,
      PERMISSIONS.ORG_CLAIM_READ,
      PERMISSIONS.ORG_CLAIM_REQUEST,
      PERMISSIONS.SELF_READ,
    ]);
    // The employee must never hold management or approval authority (segregation of duties).
    for (const forbidden of [
      PERMISSIONS.ORG_LEAVE_MANAGE,
      PERMISSIONS.ORG_LEAVE_APPROVE,
      PERMISSIONS.ORG_CLAIM_APPROVE,
      PERMISSIONS.PAYROLL_RUN_APPROVE,
    ]) {
      expect(employee?.permissions).not.toContain(forbidden);
    }
  });

  it("grants Insights authoring to admin/HR, read-only to operator/auditor, none to employee", () => {
    const perms = (key: string) =>
      TENANT_SYSTEM_ROLES.find((r) => r.key === key)?.permissions ?? [];

    for (const role of [ROLES.TENANT_ADMIN, ROLES.HR_MANAGER]) {
      expect(perms(role)).toContain(PERMISSIONS.INSIGHTS_REPORT_READ);
      expect(perms(role)).toContain(PERMISSIONS.INSIGHTS_REPORT_MANAGE);
    }
    for (const role of [ROLES.PAYROLL_OPERATOR, ROLES.AUDITOR]) {
      expect(perms(role)).toContain(PERMISSIONS.INSIGHTS_REPORT_READ);
      expect(perms(role)).not.toContain(PERMISSIONS.INSIGHTS_REPORT_MANAGE);
    }
    expect(perms(ROLES.EMPLOYEE)).not.toContain(PERMISSIONS.INSIGHTS_REPORT_READ);
  });

  it("only references permissions that exist in the catalog", () => {
    for (const role of TENANT_SYSTEM_ROLES) {
      for (const perm of role.permissions) {
        expect(ALL_PERMISSION_KEYS).toContain(perm);
      }
    }
  });
});
