import { faker } from "@faker-js/faker";
import { hash } from "@node-rs/argon2";
import { PERMISSION_CATALOG, ROLES, TENANT_SYSTEM_ROLES } from "@payce/rbac";
import { createPrismaClient, runInTenant } from "../src";

// Deterministic synthetic data only. NEVER real PII (golden rule 1).
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
            name: "HQ, New York",
            countryCode: "US",
            city: "New York",
            timezone: "America/New_York",
          },
          { name: "Remote, US", countryCode: "US" },
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

      // Phase 4 leave catalog: two paid entitlements plus an unpaid type that docks pay.
      const leaveYear = new Date().getUTCFullYear();
      const [annualLeave, sickLeave, unpaidLeave] = await Promise.all(
        [
          { code: "ANNUAL", name: "Annual Leave", isPaid: true, accrualDays: 20 },
          { code: "SICK", name: "Sick Leave", isPaid: true, accrualDays: 10 },
          { code: "UNPAID", name: "Unpaid Leave", isPaid: false, accrualDays: 30 },
        ].map((data) =>
          tx.leaveType.create({ data: { tenantId: tenant.id, createdBy: "seed", ...data } }),
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
            // Synthetic annual salary in USD minor units (cents); money is integer, never float.
            amountMinor: BigInt(faker.number.int({ min: 60_000, max: 180_000 }) * 100),
            currencyCode: "USD",
            frequency: "ANNUAL",
            effectiveFrom: hireDate,
            createdBy: "seed",
          },
        });

        // Give every employee a fresh balance for each leave type this year.
        await tx.leaveBalance.createMany({
          data: [annualLeave, sickLeave, unpaidLeave].map((type) => ({
            tenantId: tenant.id,
            employeeId: employee.id,
            leaveTypeId: type.id,
            year: leaveYear,
            entitledDays: type.accrualDays ?? 0,
          })),
        });
      }

      // Phase 5 Insights: two no-code saved reports off the `employees` dataset, a weekly delivery
      // of the first, and a default dashboard pinning the prebuilt widgets. The report `definition`
      // is the structured spec consumed by @payce/insights (dataset key + dimensions/measures/sort);
      // it is data, never SQL. Dataset/dimension/measure keys must match the @payce/insights catalog.
      const headcountReport = await tx.reportDefinition.create({
        data: {
          tenantId: tenant.id,
          name: "Headcount by department",
          description: "Active employees grouped by department.",
          dataset: "employees",
          definition: {
            dataset: "employees",
            dimensions: ["department"],
            measures: ["headcount"],
            filters: [],
            sort: { key: "headcount", direction: "desc" },
            limit: 100,
          },
          createdBy: "seed",
        },
      });
      await tx.reportDefinition.create({
        data: {
          tenantId: tenant.id,
          name: "Cost to company by department",
          description: "Annualised compensation (minor units) grouped by department.",
          dataset: "employees",
          definition: {
            dataset: "employees",
            dimensions: ["department"],
            measures: ["totalCompensationMinor"],
            filters: [],
            sort: { key: "totalCompensationMinor", direction: "desc" },
            limit: 100,
          },
          createdBy: "seed",
        },
      });

      // Next run: tomorrow at 06:00 UTC. The Phase 7 notifications worker will read due schedules.
      const nextRun = new Date();
      nextRun.setUTCDate(nextRun.getUTCDate() + 1);
      nextRun.setUTCHours(6, 0, 0, 0);
      await tx.reportSchedule.create({
        data: {
          tenantId: tenant.id,
          reportDefinitionId: headcountReport.id,
          cadence: "WEEKLY",
          format: "XLSX",
          hourUtc: 6,
          recipients: ["people-ops@demo.test"],
          nextRunAt: nextRun,
          createdBy: "seed",
        },
      });

      await tx.dashboardConfig.create({
        data: {
          tenantId: tenant.id,
          name: "Workforce overview",
          isDefault: true,
          layout: {
            widgets: [
              { type: "prebuilt", key: "headcount-by-department" },
              { type: "prebuilt", key: "cost-by-department" },
              { type: "prebuilt", key: "leave-by-type" },
            ],
          },
          createdBy: "seed",
        },
      });

      // Phase 6 Assist: a small synthetic knowledge base the assistant retrieves over (RAG source).
      // Original copy only; the assistant cites these when a question matches.
      await tx.knowledgeArticle.createMany({
        data: [
          {
            tenantId: tenant.id,
            slug: "when-is-payday",
            title: "When is payday?",
            body: "Salaries are paid on the last working day of each month. If that day falls on a weekend or public holiday, pay lands on the preceding working day. You can always ask Assist for your next pay date.",
            category: "Payroll",
            tags: ["payday", "salary", "payroll"],
            createdBy: "seed",
          },
          {
            tenantId: tenant.id,
            slug: "apply-for-leave",
            title: "How to apply for leave",
            body: "Open MyHR, choose the leave type and the start and end dates, then submit. Your manager is notified and approves or declines the request. Approved leave updates your balance automatically.",
            category: "Leave",
            tags: ["leave", "holiday", "timeoff"],
            createdBy: "seed",
          },
          {
            tenantId: tenant.id,
            slug: "submit-a-claim",
            title: "How to submit an expense claim",
            body: "In MyHR, create a claim, enter the amount and category, and attach a receipt. Finance reviews approved claims and reimburses them with the next payroll run.",
            category: "Claims",
            tags: ["claims", "expenses", "reimbursement"],
            createdBy: "seed",
          },
          {
            tenantId: tenant.id,
            slug: "find-my-payslip",
            title: "Where to find my payslips",
            body: "Your payslips are in MyHR under Payslips. Each published pay run adds a downloadable PDF. Year-to-date summaries are shown alongside the latest payslip.",
            category: "Payroll",
            tags: ["payslip", "documents"],
            createdBy: "seed",
          },
          {
            tenantId: tenant.id,
            slug: "remote-work-policy",
            title: "Remote work policy",
            body: "Employees may work remotely up to three days per week with their manager's approval. Coordinate your in-office days with your team so there is sufficient on-site coverage.",
            category: "Policies",
            tags: ["remote", "policy", "hybrid"],
            createdBy: "seed",
          },
        ],
      });

      // Phase 7 Integrations: a configured mock HCM connector and an example webhook subscribed to run
      // events. The webhook secret is an obvious synthetic placeholder (never a real secret).
      await tx.integration.create({
        data: {
          tenantId: tenant.id,
          connectorKey: "mock-hcm",
          name: "Demo HR system (mock HCM)",
          config: { count: 20 },
          createdBy: "seed",
        },
      });
      await tx.webhook.create({
        data: {
          tenantId: tenant.id,
          url: "https://hooks.demo.test/payce",
          secret: "whsec_demo_synthetic_not_a_secret",
          events: ["integration.run.succeeded", "employee.imported"],
          createdBy: "seed",
        },
      });

      // Phase 7 SSO: an OFFLINE test identity provider so "Continue with SSO" works in dev/demo with no
      // external IdP. JIT provisioning is on (new SSO users become Employees), so any demo.test email
      // can sign in via SSO. OFFLINE providers are refused in production by the provider factory.
      await tx.identityProvider.create({
        data: {
          tenantId: tenant.id,
          kind: "OFFLINE",
          name: "Demo SSO (offline test IdP)",
          enabled: true,
          allowJitProvisioning: true,
          defaultRoleKey: ROLES.EMPLOYEE,
          emailDomain: "demo.test",
          createdBy: "seed",
        },
      });

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
        `  • admin@demo.test:     tenant admin; can view the org chart (/org)\n` +
        `  • employee1@demo.test: has an employee record; can view their MyHR profile (/myhr)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
