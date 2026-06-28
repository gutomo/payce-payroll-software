import { z } from "zod";

// Minimal SCIM 2.0 User shapes we read. `.passthrough()` keeps unknown IdP-sent attributes instead of
// rejecting them (IdPs send many extension fields); we only consume what we map to a Payce user.

const ScimEmail = z.object({
  value: z.string().email(),
  primary: z.boolean().optional(),
  type: z.string().optional(),
});

const ScimName = z
  .object({
    formatted: z.string().optional(),
    givenName: z.string().optional(),
    familyName: z.string().optional(),
  })
  .passthrough();

export const ScimUserSchema = z
  .object({
    schemas: z.array(z.string()).optional(),
    userName: z.string().min(1),
    externalId: z.string().min(1).optional(),
    displayName: z.string().optional(),
    name: ScimName.optional(),
    emails: z.array(ScimEmail).optional(),
    active: z.boolean().optional(),
  })
  .passthrough();
export type ScimUserDto = z.infer<typeof ScimUserSchema>;

// PatchOp (RFC 7644 §3.5.2). We honour `active` and display-name replacements (the common JML ops).
export const ScimPatchSchema = z
  .object({
    schemas: z.array(z.string()).optional(),
    Operations: z
      .array(
        z.object({
          op: z.string(),
          path: z.string().optional(),
          value: z.unknown().optional(),
        }),
      )
      .min(1),
  })
  .passthrough();
export type ScimPatchDto = z.infer<typeof ScimPatchSchema>;

/** Resolve the primary email an IdP asserts for a user. */
export function primaryEmail(dto: ScimUserDto): string {
  const fromEmails = dto.emails?.find((e) => e.primary)?.value ?? dto.emails?.[0]?.value;
  return (fromEmails ?? dto.userName).trim().toLowerCase();
}

/** Resolve a human display name from the SCIM payload, falling back to the userName. */
export function displayNameOf(dto: ScimUserDto): string {
  const composed = [dto.name?.givenName, dto.name?.familyName].filter(Boolean).join(" ").trim();
  return (dto.displayName || dto.name?.formatted || composed || dto.userName).trim();
}
