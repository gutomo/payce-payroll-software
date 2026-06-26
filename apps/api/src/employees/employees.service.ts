import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { type Prisma, runInTenant } from "@payce/db";
import type { AuthPrincipal } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import type { ListEmployeesQuery } from "./employees.dto";

// Lean projection for lists. Compensation is intentionally excluded; pay data is sensitive and
// will get its own permission/endpoint later (and BigInt minor units don't serialize to JSON).
const LIST_SELECT = {
  id: true,
  employeeNumber: true,
  firstName: true,
  lastName: true,
  workEmail: true,
  status: true,
  hireDate: true,
  department: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
} satisfies Prisma.EmployeeSelect;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  terminationDate: true,
  costCenter: { select: { id: true, code: true, name: true } },
  manager: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } },
} satisfies Prisma.EmployeeSelect;

interface OrgNode {
  id: string;
  employeeNumber: string;
  name: string;
  reports: OrgNode[];
}

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cursor-paginated, tenant-scoped employee list. `cursor` is the last id of the prior page. */
  async list(principal: AuthPrincipal, query: ListEmployeesQuery) {
    const tenantId = this.requireTenant(principal);
    const where: Prisma.EmployeeWhereInput = {
      deletedAt: null,
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    // Fetch one extra row to know whether another page exists without a second count query.
    const rows = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.employee.findMany({
        where,
        select: LIST_SELECT,
        orderBy: { id: "asc" },
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      }),
    );
    const hasMore = rows.length > query.limit;
    const data = hasMore ? rows.slice(0, query.limit) : rows;
    const last = data.at(-1);
    return { data, nextCursor: hasMore && last ? last.id : null };
  }

  async getById(principal: AuthPrincipal, id: string) {
    const tenantId = this.requireTenant(principal);
    const employee = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.employee.findFirst({ where: { id, deletedAt: null }, select: DETAIL_SELECT }),
    );
    if (!employee) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Employee not found" });
    }
    return employee;
  }

  /** Reporting hierarchy (manager -> reports) for the tenant, as a nested tree. */
  async orgTree(principal: AuthPrincipal): Promise<OrgNode[]> {
    const tenantId = this.requireTenant(principal);
    const nodes = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.employee.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          lastName: true,
          managerId: true,
        },
        orderBy: { employeeNumber: "asc" },
      }),
    );
    return buildTree(nodes);
  }

  /** The authenticated user's own employee record (MyHR profile). */
  async myProfile(principal: AuthPrincipal) {
    const { tenantId, userId } = this.requireTenantUser(principal);
    const employee = await runInTenant(this.prisma, tenantId, (tx) =>
      tx.employee.findFirst({ where: { userId, deletedAt: null }, select: DETAIL_SELECT }),
    );
    if (!employee) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "No employee profile for this user",
      });
    }
    return employee;
  }

  private requireTenant(principal: AuthPrincipal): string {
    if (!principal.tenantId) {
      throw new BadRequestException({ code: "BAD_REQUEST", message: "Tenant context required" });
    }
    return principal.tenantId;
  }

  private requireTenantUser(principal: AuthPrincipal): { tenantId: string; userId: string } {
    if (!principal.tenantId || !principal.userId) {
      throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Tenant user required" });
    }
    return { tenantId: principal.tenantId, userId: principal.userId };
  }
}

interface FlatNode {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  managerId: string | null;
}

/** Build a reporting tree. Nodes whose manager is absent (e.g. soft-deleted) surface as roots; a
 *  `seen` guard makes any accidental cycle terminate instead of recursing forever. */
function buildTree(nodes: FlatNode[]): OrgNode[] {
  const ids = new Set(nodes.map((n) => n.id));
  const childrenOf = new Map<string | null, FlatNode[]>();
  for (const n of nodes) {
    const parent = n.managerId && ids.has(n.managerId) ? n.managerId : null;
    const list = childrenOf.get(parent) ?? [];
    list.push(n);
    childrenOf.set(parent, list);
  }
  const seen = new Set<string>();
  const toNode = (n: FlatNode): OrgNode => {
    seen.add(n.id);
    const reports = (childrenOf.get(n.id) ?? []).filter((c) => !seen.has(c.id)).map(toNode);
    return {
      id: n.id,
      employeeNumber: n.employeeNumber,
      name: `${n.firstName} ${n.lastName}`,
      reports,
    };
  };
  return (childrenOf.get(null) ?? []).map(toNode);
}
