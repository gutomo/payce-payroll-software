import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Wrap a base client so that every model operation runs inside a transaction which first sets the
 * `app.current_tenant_id` Postgres GUC. Row-Level Security policies (see the `*_rls` migration)
 * then constrain every read and write to that tenant — defense-in-depth alongside the explicit
 * `tenantId` columns. Use this for one-off, single-statement tenant-scoped operations.
 */
export function forTenant(prisma: PrismaClient, tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await prisma.$transaction([
            prisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`,
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}

export type TenantPrismaClient = ReturnType<typeof forTenant>;

/**
 * Run a callback inside a single interactive transaction scoped to `tenantId` (the GUC is set
 * transaction-locally up front, so RLS applies to every statement). Use this whenever a unit of
 * work spans multiple writes that must be atomic — e.g. tenant onboarding or login token rotation.
 */
export function runInTenant<T>(
  prisma: PrismaClient,
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}
