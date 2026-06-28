import { z } from "zod";

/** Begin an SSO sign-in: resolve the tenant's identity provider and build the authorization request. */
export const SsoStartSchema = z.object({
  tenantSlug: z.string().min(1),
  /** Optional: pick a named provider when a tenant has more than one. Defaults to its enabled one. */
  providerName: z.string().min(1).optional(),
  /** Email hint; required by the OFFLINE test IdP, optional for real OIDC. */
  email: z.string().email().optional(),
  /** The web app's callback URL the IdP redirects back to. */
  redirectUri: z.string().url(),
});
export type SsoStartDto = z.infer<typeof SsoStartSchema>;

/** Complete an SSO sign-in: validate the callback and exchange the code for tokens. */
export const SsoCallbackSchema = z.object({
  tenantSlug: z.string().min(1),
  providerId: z.string().min(1),
  code: z.string().min(1),
  /** The `state` the IdP returned. */
  state: z.string().min(1),
  /** The `state` the relying party stored at start (CSRF check: must equal `state`). */
  expectedState: z.string().min(1),
  nonce: z.string().min(1),
  codeVerifier: z.string().min(1),
  redirectUri: z.string().url(),
});
export type SsoCallbackDto = z.infer<typeof SsoCallbackSchema>;

/** Configure a tenant identity provider (admin). OFFLINE needs no fields; OIDC requires its endpoints;
 *  SAML requires only a metadata URL (federation is brokered by Cognito, ADR-0007). */
export const CreateProviderSchema = z
  .object({
    name: z.string().min(1).max(64),
    kind: z.enum(["OIDC", "SAML", "OFFLINE"]).default("OIDC"),
    enabled: z.boolean().default(true),
    issuer: z.string().url().optional(),
    clientId: z.string().min(1).optional(),
    clientSecretRef: z.string().min(1).optional(),
    authorizationEndpoint: z.string().url().optional(),
    tokenEndpoint: z.string().url().optional(),
    jwksUri: z.string().url().optional(),
    samlMetadataUrl: z.string().url().optional(),
    allowJitProvisioning: z.boolean().default(false),
    defaultRoleKey: z.string().min(1).optional(),
    emailDomain: z.string().min(1).optional(),
  })
  .superRefine((dto, ctx) => {
    if (dto.kind === "OIDC") {
      for (const field of [
        "issuer",
        "clientId",
        "authorizationEndpoint",
        "tokenEndpoint",
        "jwksUri",
      ] as const) {
        if (!dto[field]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${field} is required for an OIDC provider`,
          });
        }
      }
    }
    if (dto.kind === "SAML" && !dto.samlMetadataUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["samlMetadataUrl"],
        message: "samlMetadataUrl is required for a SAML provider",
      });
    }
    if (dto.allowJitProvisioning && !dto.defaultRoleKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultRoleKey"],
        message: "defaultRoleKey is required when allowJitProvisioning is true",
      });
    }
  });
export type CreateProviderDto = z.infer<typeof CreateProviderSchema>;
