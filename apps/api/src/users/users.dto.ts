import { z } from "zod";

export const InviteUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1),
  roleKeys: z.array(z.string().min(1)).min(1),
});
export type InviteUserDto = z.infer<typeof InviteUserSchema>;
