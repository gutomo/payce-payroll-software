/**
 * Canonical permission catalog. Keys are the source of truth shared across the platform; the
 * `permission` table (see @payce/db) is seeded from this catalog. Format: `<domain>.<resource>.<action>`.
 */
export const PERMISSIONS = {
  PLATFORM_TENANT_CREATE: "platform.tenant.create",
  PLATFORM_TENANT_READ: "platform.tenant.read",
  IDENTITY_USER_INVITE: "identity.user.invite",
  IDENTITY_USER_READ: "identity.user.read",
  IDENTITY_ROLE_ASSIGN: "identity.role.assign",
  ORG_MANAGE: "org.manage",
  ORG_EMPLOYEE_READ: "org.employee.read",
  ORG_EMPLOYEE_MANAGE: "org.employee.manage",
  PAYROLL_PAYGROUP_READ: "payroll.paygroup.read",
  PAYROLL_PAYGROUP_MANAGE: "payroll.paygroup.manage",
  PAYROLL_RUN_READ: "payroll.run.read",
  PAYROLL_RUN_MANAGE: "payroll.run.manage",
  PAYROLL_RUN_APPROVE: "payroll.run.approve",
  ORG_LEAVE_READ: "org.leave.read",
  ORG_LEAVE_REQUEST: "org.leave.request",
  ORG_LEAVE_MANAGE: "org.leave.manage",
  ORG_LEAVE_APPROVE: "org.leave.approve",
  ORG_CLAIM_READ: "org.claim.read",
  ORG_CLAIM_REQUEST: "org.claim.request",
  ORG_CLAIM_APPROVE: "org.claim.approve",
  INSIGHTS_REPORT_READ: "insights.report.read",
  INSIGHTS_REPORT_MANAGE: "insights.report.manage",
  ASSIST_USE: "assist.use",
  ASSIST_KNOWLEDGE_MANAGE: "assist.knowledge.manage",
  AUDIT_READ: "audit.read",
  SELF_READ: "self.read",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_CATALOG: ReadonlyArray<{ key: PermissionKey; description: string }> = [
  { key: PERMISSIONS.PLATFORM_TENANT_CREATE, description: "Create tenants (platform plane)" },
  { key: PERMISSIONS.PLATFORM_TENANT_READ, description: "Read tenants (platform plane)" },
  { key: PERMISSIONS.IDENTITY_USER_INVITE, description: "Invite users into a tenant" },
  { key: PERMISSIONS.IDENTITY_USER_READ, description: "Read users within a tenant" },
  { key: PERMISSIONS.IDENTITY_ROLE_ASSIGN, description: "Assign roles to users" },
  { key: PERMISSIONS.ORG_MANAGE, description: "Manage org structure (entities, departments)" },
  {
    key: PERMISSIONS.ORG_EMPLOYEE_READ,
    description: "Read employees and the org tree within a tenant",
  },
  {
    key: PERMISSIONS.ORG_EMPLOYEE_MANAGE,
    description: "Create/update employees, incl. bulk import",
  },
  {
    key: PERMISSIONS.PAYROLL_PAYGROUP_READ,
    description: "Read pay groups, calendars, and pay periods",
  },
  {
    key: PERMISSIONS.PAYROLL_PAYGROUP_MANAGE,
    description: "Create/update pay groups and generate pay periods",
  },
  {
    key: PERMISSIONS.PAYROLL_RUN_READ,
    description: "Read payroll runs and their per-employee results",
  },
  {
    key: PERMISSIONS.PAYROLL_RUN_MANAGE,
    description: "Create, calculate, submit, and publish payroll runs (maker)",
  },
  {
    key: PERMISSIONS.PAYROLL_RUN_APPROVE,
    description: "Approve or reject payroll runs (checker; maker-checker segregation)",
  },
  {
    key: PERMISSIONS.ORG_LEAVE_READ,
    description: "Read leave types, balances, and requests within a tenant",
  },
  {
    key: PERMISSIONS.ORG_LEAVE_REQUEST,
    description: "Apply for leave on one's own behalf (employee self-service)",
  },
  {
    key: PERMISSIONS.ORG_LEAVE_MANAGE,
    description: "Configure leave types and initialise/adjust employee balances (HR)",
  },
  {
    key: PERMISSIONS.ORG_LEAVE_APPROVE,
    description: "Approve or reject leave requests (manager/HR)",
  },
  {
    key: PERMISSIONS.ORG_CLAIM_READ,
    description: "Read expense claims and their attachments within a tenant",
  },
  {
    key: PERMISSIONS.ORG_CLAIM_REQUEST,
    description: "Submit expense claims with attachments on one's own behalf (self-service)",
  },
  {
    key: PERMISSIONS.ORG_CLAIM_APPROVE,
    description: "Approve or reject expense claims (manager/HR)",
  },
  {
    key: PERMISSIONS.INSIGHTS_REPORT_READ,
    description: "Run reports, export results, and view dashboards (Insights)",
  },
  {
    key: PERMISSIONS.INSIGHTS_REPORT_MANAGE,
    description: "Create/update/delete saved reports, schedules, and dashboards (Insights)",
  },
  {
    key: PERMISSIONS.ASSIST_USE,
    description: "Chat with the Assist assistant and browse the knowledge base (Assist)",
  },
  {
    key: PERMISSIONS.ASSIST_KNOWLEDGE_MANAGE,
    description: "Create/update/delete knowledge-base FAQ/policy articles (Assist)",
  },
  { key: PERMISSIONS.AUDIT_READ, description: "Read the audit trail" },
  { key: PERMISSIONS.SELF_READ, description: "Read one's own profile" },
];

export const ALL_PERMISSION_KEYS: ReadonlyArray<PermissionKey> = PERMISSION_CATALOG.map(
  (p) => p.key,
);
