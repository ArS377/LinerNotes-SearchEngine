import type { AgentResponse, SearchResponse } from "../src/contracts/api.js";

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

export function searchMusic(query: string, offset = 0) {
  return api<SearchResponse & { query: string }>(
    `/api/search?q=${encodeURIComponent(query)}&offset=${offset}`
  );
}

export function askAgent(prompt: string, context: Record<string, unknown>) {
  return api<AgentResponse>("/api/assistant", {
    method: "POST",
    body: JSON.stringify({ prompt, context })
  });
}
