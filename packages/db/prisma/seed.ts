import { faker } from "@faker-js/faker";
import { hash } from "@node-rs/argon2";
import { PERMISSION_CATALOG, ROLES, TENANT_SYSTEM_ROLES } from "@payce/rbac";
import { createPrismaClient, runInTenant } from "../src";

// Deterministic synthetic data only — NEVER real PII (golden rule 1).
faker.seed(42);

const DEMO_PASSWORD = "Demo-Passw0rd-123";

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    // Permission catalog (platform reference data).
    for (const permission of PERMISSION_CATALOG) {
      await prisma.permission.upsert({
        where: { key: permission.key },
        update: { description: permission.description },
        create: { key: permission.key, description: permission.description },
      });
    }

    const plan = await prisma.plan.upsert({
      where: { key: "starter" },
      update: {},
      create: { key: "starter", name: "Starter" },
    });

    if (await prisma.tenant.findUnique({ where: { slug: "demo" } })) {
      console.log("Demo tenant already seeded; skipping.");
      return;
    }

    const tenant = await prisma.tenant.create({
      data: {
        slug: "demo",
        name: "Demo Corp",
        status: "ACTIVE",
        planId: plan.id,
        createdBy: "seed",
      },
    });
    const passwordHash = await hash(DEMO_PASSWORD);

    await runInTenant(prisma, tenant.id, async (tx) => {
      await tx.role.createMany({
        data: TENANT_SYSTEM_ROLES.map((role) => ({
          tenantId: tenant.id,
          key: role.key,
          name: role.name,
          isSystem: true,
          permissionKeys: [...role.permissions],
        })),
      });
      const roleId = Object.fromEntries((await tx.role.findMany()).map((r) => [r.key, r.id]));

      const admin = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: "admin@demo.test",
          displayName: "Demo Admin",
          status: "ACTIVE",
          createdBy: "seed",
        },
      });
      await tx.credential.create({ data: { tenantId: tenant.id, userId: admin.id, passwordHash } });
      await tx.userRole.create({
        data: { tenantId: tenant.id, userId: admin.id, roleId: roleId[ROLES.TENANT_ADMIN] },
      });

      const entity = await tx.legalEntity.create({
        data: { tenantId: tenant.id, name: "Demo Corp Ltd", countryCode: "US", createdBy: "seed" },
      });
      for (const name of ["Engineering", "Finance", "People"]) {
        await tx.department.create({
          data: { tenantId: tenant.id, legalEntityId: entity.id, name },
        });
      }

      for (let i = 1; i <= 12; i++) {
        const user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: `employee${i}@demo.test`,
            displayName: faker.person.fullName(),
            status: "ACTIVE",
            createdBy: "seed",
          },
        });
        await tx.credential.create({
          data: { tenantId: tenant.id, userId: user.id, passwordHash },
        });
        await tx.userRole.create({
          data: { tenantId: tenant.id, userId: user.id, roleId: roleId[ROLES.EMPLOYEE] },
        });
      }

      await tx.auditEvent.create({
        data: {
          tenantId: tenant.id,
          actorType: "system",
          action: "tenant.seeded",
          entityType: "Tenant",
          entityId: tenant.id,
        },
      });
    });

    console.log(`Seeded demo tenant ${tenant.id} (admin@demo.test / ${DEMO_PASSWORD}).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
