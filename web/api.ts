import type { AgentResponse, RecommendationResponse, RecordingSummary, SearchResponse } from "../src/contracts/api.js";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed with ${response.status}`);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export function searchMusic(query: string, offset = 0, mode: "local" | "federated" = "federated") {
  return api<SearchResponse & { query: string }>(
    `/api/search?q=${encodeURIComponent(query)}&offset=${offset}&mode=${mode}`
  );
}

export function getRecommendations(bookmarks: RecordingSummary[], recentQueries: string[]) {
  return api<RecommendationResponse>("/api/v1/recommendations", {
    method: "POST",
    body: JSON.stringify({ bookmarks, recentQueries, limit: 12 })
  });
}

export function askAgent(prompt: string, context: Record<string, unknown>) {
  return api<AgentResponse>("/api/assistant", {
    method: "POST",
    body: JSON.stringify({ prompt, context })
  });
}
