import { z } from "zod";

const FREQUENCY = ["ANNUAL", "MONTHLY", "SEMI_MONTHLY", "BIWEEKLY", "WEEKLY"] as const;

/** Body for POST /payroll/pay-groups: the group plus its calendar generation parameters. */
export const CreatePayGroupSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(120),
  // ISO 3166-1 alpha-2; must map to a known country rule pack (validated in the service).
  countryCode: z
    .string()
    .trim()
    .length(2)
    .transform((s) => s.toUpperCase()),
  // ISO 4217; must match the rule pack's currency (validated in the service).
  currencyCode: z
    .string()
    .trim()
    .length(3)
    .transform((s) => s.toUpperCase()),
  frequency: z.enum(FREQUENCY),
  legalEntityId: z.string().uuid().optional(),
  calendar: z.object({
    anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "anchorDate must be YYYY-MM-DD"),
    payDateOffsetDays: z.coerce.number().int().min(0).max(60).default(0),
    timezone: z.string().trim().min(1).max(64).optional(),
  }),
});
export type CreatePayGroupDto = z.infer<typeof CreatePayGroupSchema>;

/** Body for POST /payroll/pay-groups/:id/periods: how many periods to materialize next. */
export const GeneratePeriodsSchema = z.object({
  count: z.coerce.number().int().min(1).max(120),
});
export type GeneratePeriodsDto = z.infer<typeof GeneratePeriodsSchema>;

/** Body for POST /payroll/pay-groups/:id/members: employees to assign to the group. */
export const AssignMembersSchema = z.object({
  employeeIds: z.array(z.string().uuid()).min(1).max(1000),
});
export type AssignMembersDto = z.infer<typeof AssignMembersSchema>;
