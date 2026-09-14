import { z } from "zod";

export const slugSchema = z.string().min(1).max(180).regex(/^[a-zA-Z0-9-]+$/);
export const discoveryRequestSchema = z.object({
  seedSlug: slugSchema,
  focus: z.enum(["balanced", "genre", "era"]).default("balanced"),
  differentArtists: z.boolean().default(true),
  unfamiliarArtists: z.boolean().default(false),
  knownArtists: z.array(z.string().min(1).max(240)).max(200).default([]),
  excludeSlugs: z.array(slugSchema).max(250).default([]),
  limit: z.number().int().min(1).max(10).default(5)
}).strict();

export const trailSchema = z.object({
  version: z.literal(1),
  steps: z.array(z.object({
    slug: slugSchema,
    title: z.string().min(1).max(240),
    artist: z.string().min(1).max(240),
    reason: z.string().max(1000).optional()
  }).strict()).min(1).max(10),
  focus: z.enum(["balanced", "genre", "era"]),
  differentArtists: z.boolean()
}).strict();
