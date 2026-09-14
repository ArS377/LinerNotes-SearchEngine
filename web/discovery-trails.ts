import { z } from "zod";
import { trailSchema } from "../src/contracts/discovery.js";

export type Trail = z.infer<typeof trailSchema>;
export type SavedTrail = { id: string; title: string; savedAt: string; trail: Trail };
export const trailStorageKey = "liner-notes-discovery-trails-v1";

export function readTrail(value: string): Trail | null {
  if (!value || value.length > 16000) return null;
  try { const result = trailSchema.safeParse(JSON.parse(value)); return result.success ? result.data : null; } catch { return null; }
}

export function trailPath(trail: Trail) {
  const validated = trailSchema.parse(trail);
  const params = new URLSearchParams({ seed: validated.steps.at(-1)!.slug, focus: validated.focus, different: validated.differentArtists ? "1" : "0", trail: JSON.stringify(validated) });
  return `/discover?${params}`;
}

export function readSavedTrails(storage: Pick<Storage, "getItem">): SavedTrail[] {
  try {
    const values = JSON.parse(storage.getItem(trailStorageKey) || "[]");
    if (!Array.isArray(values)) return [];
    return values.slice(0, 30).filter((item) => typeof item?.id === "string" && typeof item.title === "string" && typeof item.savedAt === "string" && trailSchema.safeParse(item.trail).success);
  } catch { return []; }
}
