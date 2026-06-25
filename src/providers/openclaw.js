import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
let fetchImplementation = globalThis.fetch;
let execFileImplementation = execFileAsync;

function openClawBaseUrl() {
  const value = process.env.OPENCLAW_BASE_URL?.trim();
  return value ? value.replace(/\/+$/, "") : "";
}

function openClawTransport() {
  return process.env.OPENCLAW_TRANSPORT?.trim().toLowerCase() || "http";
}

function openClawCliPath() {
  return process.env.OPENCLAW_CLI_PATH?.trim() || "openclaw";
}

export function openClawConfigured() {
  if (openClawTransport() === "cli") return true;
  return Boolean(openClawBaseUrl() && process.env.OPENCLAW_API_KEY);
}

function assistantContext(context) {
  return {
    application: "Liner Notes",
    mode: "read-only music research assistant",
    ...context
  };
}

function promptWithContext(prompt, context) {
  return [
    prompt,
    "",
    "Use this read-only Liner Notes context. Do not claim to have changed files, playlists, accounts, or external services.",
    JSON.stringify(assistantContext(context), null, 2)
  ].join("\n");
}

function normalizeOpenClawBody(body) {
  return {
    answer: String(
      body.answer
      || body.message
      || body.response
      || body.reply
      || body.text
      || body.output
      || ""
    ).trim(),
    citations: Array.isArray(body.citations) ? body.citations : [],
    model: body.model || body.modelId || null
  };
}

async function askOpenClawCli(prompt, context) {
  const message = promptWithContext(prompt, context);
  const { stdout } = await execFileImplementation(
    openClawCliPath(),
    [
      "agent",
      "--session-key",
      process.env.OPENCLAW_SESSION_KEY || "agent:main:liner-notes",
      "--message",
      message,
      "--thinking",
      process.env.OPENCLAW_THINKING || "low",
      "--timeout",
      process.env.OPENCLAW_TIMEOUT_SECONDS || "180",
      "--json"
    ],
    {
      timeout: Number(process.env.OPENCLAW_PROCESS_TIMEOUT_MS || 190000),
      maxBuffer: 1024 * 1024
    }
  );
  const text = String(stdout || "").trim();
  if (!text) return { answer: "", citations: [], model: null };
  try {
    return normalizeOpenClawBody(JSON.parse(text));
  } catch {
    return { answer: text, citations: [], model: null };
  }
}

export async function askOpenClaw(prompt, context = {}) {
  const cleanPrompt = String(prompt || "").trim();
  if (!cleanPrompt) {
    const error = new Error("Ask a question about the music catalog.");
    error.code = "EMPTY_PROMPT";
    throw error;
  }

  if (openClawTransport() === "cli") {
    return askOpenClawCli(cleanPrompt, context);
  }

  if (!openClawConfigured()) {
    const error = new Error("OpenClaw is not configured.");
    error.code = "NOT_CONFIGURED";
    throw error;
  }

  const response = await fetchImplementation(`${openClawBaseUrl()}/api/ask`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENCLAW_API_KEY}`
    },
    body: JSON.stringify({
      prompt: cleanPrompt,
      context: assistantContext(context)
    }),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error(`OpenClaw returned ${response.status}`);
  }

  const body = await response.json();
  return normalizeOpenClawBody(body);
}

export function setOpenClawFetchForTests(fetchFn) {
  fetchImplementation = fetchFn;
}

export function setOpenClawExecFileForTests(execFileFn) {
  execFileImplementation = execFileFn || execFileAsync;
}
