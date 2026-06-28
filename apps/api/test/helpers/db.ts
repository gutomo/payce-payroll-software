import { createPrismaClient, type PrismaClient } from "@payce/db";

export function testPrisma(): PrismaClient {
  return createPrismaClient();
}

/** Wipe all data between integration runs. TRUNCATE is an owner-level op, not subject to RLS. */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE
      "assist_escalation", "assist_message", "assist_conversation", "knowledge_article",
      "report_schedule", "report_definition", "dashboard_config",
      "claim_attachment", "claim", "leave_request", "leave_balance", "leave_type",
      "bank_file", "payslip_document", "anomaly", "approval", "payroll_run_line", "payroll_run",
      "pay_period", "pay_calendar", "pay_group",
      "compensation_record", "employment_record", "employee", "cost_center", "location",
      "audit_event", "refresh_token", "user_role", "credential", "app_user",
      "role", "department", "legal_entity", "tenant", "plan", "permission"
     RESTART IDENTITY CASCADE;`,
  );
}
