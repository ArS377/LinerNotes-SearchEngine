import { z } from "zod";

export const recordingSummarySchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().min(1),
  source: z.string().optional(),
  providers: z.array(z.string()).optional(),
  external: z.boolean().optional(),
  artworkUrl: z.string().url().nullable().optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
  previewUrl: z.string().url().nullable().optional(),
  matchReason: z.string().optional(),
  spotifyPopularity: z.number().min(0).max(100).nullable().optional()
}).passthrough();

export const providerStatusSchema = z.enum(["ok", "unavailable", "not-configured"]);

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0)
});

export const searchResponseSchema = z.object({
  results: z.array(recordingSummarySchema),
  localCount: z.number().int().nonnegative(),
  globalCount: z.number().int().nonnegative(),
  remoteStatus: z.enum(["ok", "unavailable"]),
  providerStatus: z.record(z.string(), providerStatusSchema),
  offset: z.number().int().nonnegative(),
  nextOffset: z.number().int().positive(),
  hasMore: z.boolean()
});

export const citationSchema = z.object({
  title: z.string().min(1),
  url: z.string().url().optional(),
  source: z.string().optional(),
  fields: z.array(z.string()).optional()
});

export const agentMessageSchema = z.object({
  prompt: z.string().trim().min(1).max(2_000),
  context: z.record(z.string(), z.unknown()).default({})
});

export const agentResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(citationSchema),
  suggestions: z.array(recordingSummarySchema).default([]),
  confidence: z.enum(["grounded", "partial", "insufficient"]),
  model: z.string().nullable(),
  toolActivity: z.array(z.object({
    tool: z.string(),
    status: z.enum(["ok", "error"])
  })).default([])
});

export const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  REDIS_URL: z.string().url().optional(),
  SENTRY_DSN: z.string().url().optional()
}).superRefine((environment, context) => {
  const supabaseValues = [
    environment.SUPABASE_URL,
    environment.SUPABASE_ANON_KEY,
    environment.SUPABASE_SERVICE_ROLE_KEY
  ];
  if (supabaseValues.some(Boolean) && !supabaseValues.every(Boolean)) {
    context.addIssue({
      code: "custom",
      message: "Supabase requires URL, anonymous key, and service role key"
    });
  }
});

export type RecordingSummary = z.infer<typeof recordingSummarySchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
export type AgentResponse = z.infer<typeof agentResponseSchema>;

export function parseEnvironment(environment: NodeJS.ProcessEnv) {
  return environmentSchema.parse(environment);
}
