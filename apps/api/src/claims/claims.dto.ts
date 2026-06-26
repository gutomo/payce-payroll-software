import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a YYYY-MM-DD date");

// Employee submits an expense claim (on their own behalf).
export const CreateClaimSchema = z.object({
  category: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Z0-9_]+$/, "category must be uppercase letters, digits, or underscores"),
  title: z.string().trim().min(1).max(200),
  // Integer minor units, strictly positive; money is never a float (CLAUDE.md money rule).
  amountMinor: z.number().int().positive().max(1_000_000_00),
  currencyCode: z.string().regex(/^[A-Z]{3}$/, "currencyCode must be a 3-letter ISO code"),
  incurredOn: isoDate,
  note: z.string().trim().max(500).optional(),
});
export type CreateClaimDto = z.infer<typeof CreateClaimSchema>;

// Receipt upload. Content is base64-encoded in the JSON body (the API is JSON end-to-end); the
// service decodes it to a Buffer and stores the binary in S3. ~7MB cap on the decoded payload.
export const AddAttachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(120),
  contentBase64: z
    .string()
    .min(1)
    .max(10_000_000, "attachment too large (max ~7MB)")
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "contentBase64 must be valid base64"),
});
export type AddAttachmentDto = z.infer<typeof AddAttachmentSchema>;

// Approver's optional note when approving/rejecting a claim.
export const ClaimDecisionSchema = z.object({
  note: z.string().trim().max(500).optional(),
});
export type ClaimDecisionDto = z.infer<typeof ClaimDecisionSchema>;
