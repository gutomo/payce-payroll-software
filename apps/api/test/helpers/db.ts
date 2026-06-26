import { createPrismaClient, type PrismaClient } from "@payce/db";

export function testPrisma(): PrismaClient {
  return createPrismaClient();
}

/** Wipe all data between integration runs. TRUNCATE is an owner-level op, not subject to RLS. */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE
      "pay_period", "pay_calendar", "pay_group",
      "compensation_record", "employment_record", "employee", "cost_center", "location",
      "audit_event", "refresh_token", "user_role", "credential", "app_user",
      "role", "department", "legal_entity", "tenant", "plan", "permission"
     RESTART IDENTITY CASCADE;`,
  );
}
