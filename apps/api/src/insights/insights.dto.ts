import { ReportSpecSchema } from "@payce/insights";
import { z } from "zod";

/**
 * Request schemas for the Insights API. The report *spec* itself is validated by `@payce/insights`
 * (`ReportSpecSchema`), the single source of truth shared with the pure reporting kernel; these
 * schemas wrap it for the ad-hoc run, saved-report CRUD, and schedule endpoints. Catalog-level
 * validation (do these dataset/field keys exist?) happens when the spec is compiled in the service.
 */

/** Ad-hoc run: the body IS a report spec. */
export const RunReportSchema = ReportSpecSchema;
export type RunReportDto = z.infer<typeof RunReportSchema>;

export const CreateReportSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    spec: ReportSpecSchema,
  })
  .strict();
export type CreateReportDto = z.infer<typeof CreateReportSchema>;

export const UpdateReportSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).nullable().optional(),
    spec: ReportSpecSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });
export type UpdateReportDto = z.infer<typeof UpdateReportSchema>;

// Recipients are synthetic addresses only (golden rule 1: no real PII anywhere).
const RecipientSchema = z.string().email().max(254);

export const CreateScheduleSchema = z
  .object({
    cadence: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
    format: z.enum(["CSV", "XLSX"]).default("XLSX"),
    hourUtc: z.number().int().min(0).max(23).default(6),
    recipients: z.array(RecipientSchema).min(1).max(50),
  })
  .strict();
export type CreateScheduleDto = z.infer<typeof CreateScheduleSchema>;

export const UpdateScheduleSchema = z
  .object({
    cadence: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).optional(),
    format: z.enum(["CSV", "XLSX"]).optional(),
    hourUtc: z.number().int().min(0).max(23).optional(),
    recipients: z.array(RecipientSchema).min(1).max(50).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });
export type UpdateScheduleDto = z.infer<typeof UpdateScheduleSchema>;

/** Export format query param; defaults to XLSX when omitted. */
export const ExportFormatSchema = z.enum(["csv", "xlsx"]).default("xlsx");
export type ExportFormat = z.infer<typeof ExportFormatSchema>;
