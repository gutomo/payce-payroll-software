import { z } from "zod";

/** Body for POST /payroll/runs: open a run for one pay group + pay period. */
export const CreateRunSchema = z.object({
  payGroupId: z.string().uuid(),
  payPeriodId: z.string().uuid(),
});
export type CreateRunDto = z.infer<typeof CreateRunSchema>;

/** Optional note attached to a submit/approve/reject transition (kept in the maker-checker trail). */
export const DecisionSchema = z.object({
  note: z.string().trim().max(500).optional(),
});
export type DecisionDto = z.infer<typeof DecisionSchema>;
