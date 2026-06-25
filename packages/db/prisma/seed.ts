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
      const departments = await Promise.all(
        ["Engineering", "Finance", "People"].map((name) =>
          tx.department.create({ data: { tenantId: tenant.id, legalEntityId: entity.id, name } }),
        ),
      );
      const locations = await Promise.all(
        [
          {
            name: "HQ — New York",
            countryCode: "US",
            city: "New York",
            timezone: "America/New_York",
          },
          { name: "Remote — US", countryCode: "US" },
        ].map((data) =>
          tx.location.create({ data: { tenantId: tenant.id, createdBy: "seed", ...data } }),
        ),
      );
      const costCenters = await Promise.all(
        [
          { code: "CC-ENG", name: "Engineering" },
          { code: "CC-GNA", name: "General & Admin" },
        ].map((data) =>
          tx.costCenter.create({
            data: { tenantId: tenant.id, legalEntityId: entity.id, createdBy: "seed", ...data },
          }),
        ),
      );

      // Employee #1 manages the rest, forming a one-level org tree for the Phase 2 org-tree view.
      let managerId: string | null = null;
      for (let i = 1; i <= 12; i++) {
        const firstName = faker.person.firstName();
        const lastName = faker.person.lastName();
        const user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: `employee${i}@demo.test`,
            displayName: `${firstName} ${lastName}`,
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

        const department = departments[i % departments.length];
        const hireDate = faker.date.past({ years: 5 });
        const employee = await tx.employee.create({
          data: {
            tenantId: tenant.id,
            employeeNumber: `E-${String(i).padStart(4, "0")}`,
            userId: user.id,
            firstName,
            lastName,
            workEmail: `employee${i}@demo.test`,
            status: "ACTIVE",
            hireDate,
            departmentId: department.id,
            locationId: locations[i % locations.length].id,
            costCenterId: costCenters[i % costCenters.length].id,
            managerId,
            createdBy: "seed",
          },
        });
        managerId ??= employee.id;

        await tx.employmentRecord.create({
          data: {
            tenantId: tenant.id,
            employeeId: employee.id,
            employmentType: "FULL_TIME",
            jobTitle: faker.person.jobTitle(),
            legalEntityId: entity.id,
            departmentId: department.id,
            effectiveFrom: hireDate,
            createdBy: "seed",
          },
        });
        await tx.compensationRecord.create({
          data: {
            tenantId: tenant.id,
            employeeId: employee.id,
            // Synthetic annual salary in USD minor units (cents) — money is integer, never float.
            amountMinor: BigInt(faker.number.int({ min: 60_000, max: 180_000 }) * 100),
            currencyCode: "USD",
            frequency: "ANNUAL",
            effectiveFrom: hireDate,
            createdBy: "seed",
          },
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

    console.log(
      `Seeded demo tenant ${tenant.id}. Sign in at /login (workspace "demo", password ${DEMO_PASSWORD}):\n` +
        `  • admin@demo.test     — tenant admin; can view the org chart (/org)\n` +
        `  • employee1@demo.test — has an employee record; can view their MyHR profile (/myhr)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
