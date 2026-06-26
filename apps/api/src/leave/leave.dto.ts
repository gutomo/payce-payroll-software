import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a YYYY-MM-DD date");

// HR configures the leave categories available to a tenant.
export const CreateLeaveTypeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Z0-9_]+$/, "code must be uppercase letters, digits, or underscores"),
  name: z.string().trim().min(1).max(120),
  isPaid: z.boolean().default(true),
  accrualDays: z.number().min(0).max(365).optional(),
  carryOverMax: z.number().min(0).max(365).optional(),
});
export type CreateLeaveTypeDto = z.infer<typeof CreateLeaveTypeSchema>;

// HR initialises or adjusts an employee's annual entitlement for a leave type.
export const UpsertLeaveBalanceSchema = z.object({
  employeeId: z.string().uuid(),
  leaveTypeId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  entitledDays: z.number().min(0).max(365),
});
export type UpsertLeaveBalanceDto = z.infer<typeof UpsertLeaveBalanceSchema>;

// An employee applies for leave (on their own behalf). Days are derived server-side from the range.
export const ApplyLeaveSchema = z
  .object({
    leaveTypeId: z.string().uuid(),
    startDate: isoDate,
    endDate: isoDate,
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });
export type ApplyLeaveDto = z.infer<typeof ApplyLeaveSchema>;

// Approver's optional note when approving/rejecting a request.
export const LeaveDecisionSchema = z.object({
  note: z.string().trim().max(500).optional(),
});
export type LeaveDecisionDto = z.infer<typeof LeaveDecisionSchema>;
