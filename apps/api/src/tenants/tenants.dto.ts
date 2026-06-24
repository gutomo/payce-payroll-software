import { z } from "zod";

export const CreateTenantSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric or hyphen"),
  admin: z.object({
    email: z.string().email(),
    displayName: z.string().min(1),
    password: z.string().min(12),
  }),
});
export type CreateTenantDto = z.infer<typeof CreateTenantSchema>;
