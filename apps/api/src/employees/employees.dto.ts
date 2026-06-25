import { z } from "zod";

/** Query params for GET /employees — cursor pagination + optional filters. */
export const ListEmployeesSchema = z.object({
  // Cursor is an opaque employee id from a prior page's `nextCursor`.
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  departmentId: z.string().uuid().optional(),
  status: z.enum(["ACTIVE", "ON_LEAVE", "TERMINATED"]).optional(),
});
export type ListEmployeesQuery = z.infer<typeof ListEmployeesSchema>;
