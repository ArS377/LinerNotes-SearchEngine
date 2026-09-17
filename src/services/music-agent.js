import { randomUUID } from "node:crypto";
import { askDeepInfra } from "../providers/deepinfra.js";
import { federatedSearch } from "../federated-search.js";
import { getArtistProfile, getRecording } from "../catalog.js";

const conversations = new Map();

function safeContext(value, depth = 0) {
  if (depth > 5) return "[context depth limited]";
  if (typeof value === "string") return value.slice(0, 4_000);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeContext(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 50)
        .map(([key, item]) => [key, safeContext(item, depth + 1)])
    );
  }
  return value;
}

export const musicAgentTools = {
  async search({ query, limit = 8 }) {
    const response = await federatedSearch(String(query).slice(0, 200), { limit: Math.min(10, limit) });
    return response.results;
  },
  async recording({ slug }) {
    return getRecording(String(slug)) || null;
  },
  async artist({ slug }) {
    return getArtistProfile(String(slug)) || null;
  }
};

export function createConversation() {
  const id = randomUUID();
  conversations.set(id, []);
  return { id, createdAt: new Date().toISOString() };
}

export async function sendAgentMessage(conversationId, prompt, context = {}) {
  if (!conversations.has(conversationId)) {
    const error = new Error("Conversation not found");
    error.code = "NOT_FOUND";
    throw error;
  }
  const messages = conversations.get(conversationId);
  const boundedContext = safeContext(context);
  const response = await askDeepInfra(prompt, {
    ...boundedContext,
    conversation: messages.slice(-6)
  });
  messages.push(
    { role: "user", content: String(prompt).slice(0, 2_000) },
    { role: "assistant", content: response.answer, citations: response.citations }
  );
  return response;
}

export function clearAgentConversationsForTests() {
  conversations.clear();
}
