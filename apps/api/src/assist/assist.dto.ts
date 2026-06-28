import { z } from "zod";

// A turn from the user. `conversationId` continues an existing thread (verified to be the caller's);
// omit it to start a new one.
export const SendMessageSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  conversationId: z.string().uuid().optional(),
});
export type SendMessageDto = z.infer<typeof SendMessageSchema>;

// A knowledge-base article (FAQ / policy / how-to) the assistant retrieves over. Synthetic, original
// copy only (golden rule 1/2).
export const CreateKnowledgeSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, digits, or hyphens"),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10_000),
  category: z.string().trim().max(64).optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(20).optional(),
});
export type CreateKnowledgeDto = z.infer<typeof CreateKnowledgeSchema>;

export const UpdateKnowledgeSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(10_000),
    category: z.string().trim().max(64).nullable(),
    tags: z.array(z.string().trim().min(1).max(32)).max(20),
    isActive: z.boolean(),
  })
  .partial();
export type UpdateKnowledgeDto = z.infer<typeof UpdateKnowledgeSchema>;
