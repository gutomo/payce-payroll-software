import { z } from "zod";

/**
 * Throwaway dev placeholders so `pnpm dev` and tests boot without a full .env. They are committed
 * (and mirrored in .env.example), so they are PUBLIC — never valid for a real deployment. The
 * superRefine below rejects them when NODE_ENV=production, so a misconfigured prod fails closed
 * instead of silently signing tokens / authenticating the platform plane with a known secret.
 * In staging/prod every secret comes from AWS Secrets Manager (see architecture §7).
 */
const DEV_PLACEHOLDER_SECRETS = {
  JWT_ACCESS_SECRET: "dev-access-secret-change-me-please",
  JWT_MFA_SECRET: "dev-mfa-secret-change-me-please!!",
  PLATFORM_ADMIN_KEY: "dev-platform-admin-key",
} as const;

/**
 * Environment schema. Secret fields keep dev defaults for local ergonomics but MUST be overridden
 * with non-default values in production (enforced below).
 */
export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(16).default(DEV_PLACEHOLDER_SECRETS.JWT_ACCESS_SECRET),
    JWT_MFA_SECRET: z.string().min(16).default(DEV_PLACEHOLDER_SECRETS.JWT_MFA_SECRET),
    ACCESS_TOKEN_TTL: z.string().default("15m"),
    MFA_TOKEN_TTL: z.string().default("5m"),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    PLATFORM_ADMIN_KEY: z.string().min(8).default(DEV_PLACEHOLDER_SECRETS.PLATFORM_ADMIN_KEY),
    TOTP_ISSUER: z.string().default("Payce"),
    // S3 / LocalStack — optional; payslip PDF upload is a no-op when not set.
    AWS_REGION: z.string().default("us-east-1"),
    AWS_ENDPOINT_URL: z.string().optional(),
    S3_BUCKET_PAYSLIPS: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    // A missing var resolves to the committed default, so checking equality covers both
    // "unset in prod" and "explicitly set to the public placeholder" — both fail closed.
    for (const key of ["JWT_ACCESS_SECRET", "JWT_MFA_SECRET", "PLATFORM_ADMIN_KEY"] as const) {
      if (env[key] === DEV_PLACEHOLDER_SECRETS[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} must be set to a non-default value in production`,
        });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return EnvSchema.parse(config);
}
