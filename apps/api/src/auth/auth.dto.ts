import { z } from "zod";

export const LoginSchema = z.object({
  tenantSlug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginDto = z.infer<typeof LoginSchema>;

export const MfaVerifySchema = z.object({
  mfaToken: z.string().min(1),
  code: z.string().regex(/^\d{6,8}$/, "Code must be 6-8 digits"),
});
export type MfaVerifyDto = z.infer<typeof MfaVerifySchema>;

export const MfaActivateSchema = z.object({
  code: z.string().regex(/^\d{6,8}$/, "Code must be 6-8 digits"),
});
export type MfaActivateDto = z.infer<typeof MfaActivateSchema>;

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshDto = z.infer<typeof RefreshSchema>;
