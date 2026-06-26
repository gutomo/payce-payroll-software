import { PERMISSIONS, type PermissionKey } from "./permissions";

/** Role keys. `super_admin` is a platform-plane role; the rest are seeded per tenant. */
export const ROLES = {
  SUPER_ADMIN: "super_admin",
  TENANT_ADMIN: "tenant_admin",
  PAYROLL_OPERATOR: "payroll_operator",
  PAYROLL_APPROVER: "payroll_approver",
  HR_MANAGER: "hr_manager",
  EMPLOYEE: "employee",
  AUDITOR: "auditor",
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

export interface RoleDefinition {
  key: RoleKey;
  name: string;
  permissions: PermissionKey[];
}

/** Roles seeded into every new tenant (see PLAN.md §4). `super_admin` is intentionally excluded. */
export const TENANT_SYSTEM_ROLES: ReadonlyArray<RoleDefinition> = [
  {
    key: ROLES.TENANT_ADMIN,
    name: "Tenant Admin",
    permissions: [
      PERMISSIONS.IDENTITY_USER_INVITE,
      PERMISSIONS.IDENTITY_USER_READ,
      PERMISSIONS.IDENTITY_ROLE_ASSIGN,
      PERMISSIONS.ORG_MANAGE,
      PERMISSIONS.ORG_EMPLOYEE_READ,
      PERMISSIONS.ORG_EMPLOYEE_MANAGE,
      PERMISSIONS.PAYROLL_PAYGROUP_READ,
      PERMISSIONS.PAYROLL_PAYGROUP_MANAGE,
      PERMISSIONS.AUDIT_READ,
      PERMISSIONS.SELF_READ,
    ],
  },
  {
    key: ROLES.PAYROLL_OPERATOR,
    name: "Payroll Operator",
    permissions: [
      PERMISSIONS.IDENTITY_USER_READ,
      PERMISSIONS.ORG_EMPLOYEE_READ,
      PERMISSIONS.PAYROLL_PAYGROUP_READ,
      PERMISSIONS.PAYROLL_PAYGROUP_MANAGE,
      PERMISSIONS.SELF_READ,
    ],
  },
  {
    key: ROLES.PAYROLL_APPROVER,
    name: "Payroll Approver",
    permissions: [PERMISSIONS.PAYROLL_PAYGROUP_READ, PERMISSIONS.SELF_READ],
  },
  {
    key: ROLES.HR_MANAGER,
    name: "HR Manager",
    permissions: [
      PERMISSIONS.IDENTITY_USER_READ,
      PERMISSIONS.ORG_EMPLOYEE_READ,
      PERMISSIONS.ORG_EMPLOYEE_MANAGE,
      PERMISSIONS.PAYROLL_PAYGROUP_READ,
      PERMISSIONS.SELF_READ,
    ],
  },
  {
    key: ROLES.EMPLOYEE,
    name: "Employee",
    permissions: [PERMISSIONS.SELF_READ],
  },
  {
    key: ROLES.AUDITOR,
    name: "Auditor",
    permissions: [
      PERMISSIONS.AUDIT_READ,
      PERMISSIONS.IDENTITY_USER_READ,
      PERMISSIONS.ORG_EMPLOYEE_READ,
      PERMISSIONS.PAYROLL_PAYGROUP_READ,
      PERMISSIONS.SELF_READ,
    ],
  },
];

/** Permissions held by the platform principal (authenticated via the platform admin key). */
export const PLATFORM_PERMISSIONS: ReadonlyArray<PermissionKey> = [
  PERMISSIONS.PLATFORM_TENANT_CREATE,
  PERMISSIONS.PLATFORM_TENANT_READ,
  PERMISSIONS.AUDIT_READ,
];
