import { z } from "zod";

// Configure a connector instance for the tenant. `config.count` bounds how many records an inbound
// sync pulls per run. No secrets here (golden rule 3) — real credentials live in Secrets Manager.
export const CreateIntegrationSchema = z.object({
  connectorKey: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  config: z
    .object({
      count: z.number().int().min(1).max(1000).optional(),
    })
    .optional(),
});
export type CreateIntegrationDto = z.infer<typeof CreateIntegrationSchema>;

// Trigger an inbound sync. `idempotencyKey` makes the run idempotent: re-triggering with the same key
// returns the existing run instead of importing again (CLAUDE.md: idempotency keys on job-creating POSTs).
export const TriggerRunSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
  count: z.number().int().min(1).max(1000).optional(),
});
export type TriggerRunDto = z.infer<typeof TriggerRunSchema>;

// Register an outbound webhook. `events` is the set of event types to deliver; validated against the
// known catalog in the service.
export const CreateWebhookSchema = z.object({
  url: z.string().url().max(2000),
  events: z.array(z.string().trim().min(1).max(64)).min(1).max(20),
});
export type CreateWebhookDto = z.infer<typeof CreateWebhookSchema>;
