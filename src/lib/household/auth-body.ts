import { z } from "zod";

export const telegramLoginSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    username: z.string().optional(),
    photo_url: z.string().optional(),
    auth_date: z.union([z.number(), z.string()]),
    hash: z.string(),
  })
  .passthrough();

export const householdAuthBaseSchema = z.object({
  initData: z.string().min(1).optional(),
  telegramLogin: telegramLoginSchema.optional(),
});

export const householdAuthSchema = householdAuthBaseSchema.refine(
  (b) => Boolean(b.initData?.trim() || b.telegramLogin),
  { message: "auth_required" },
);

export type HouseholdAuthInput = z.infer<typeof householdAuthBaseSchema>;
