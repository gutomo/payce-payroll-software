import { z } from "zod";

/**
 * Environment schema. Dev defaults are intentionally fake placeholders so `pnpm dev` boots without
 * a full .env; in staging/prod every secret comes from AWS Secrets Manager (see architecture §7).
 */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16).default("dev-access-secret-change-me-please"),
  JWT_MFA_SECRET: z.string().min(16).default("dev-mfa-secret-change-me-please!!"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  MFA_TOKEN_TTL: z.string().default("5m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  PLATFORM_ADMIN_KEY: z.string().min(8).default("dev-platform-admin-key"),
  TOTP_ISSUER: z.string().default("Payce"),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return EnvSchema.parse(config);
}
