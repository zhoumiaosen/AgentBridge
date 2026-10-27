import { setTimeout as wait } from "node:timers/promises";

export type NebiusToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type NebiusMessage = { role: "assistant"; content: string | null; tool_calls?: NebiusToolCall[] };
export type NebiusRequest = {
  messages: Record<string, unknown>[];
  tools?: unknown[];
  toolChoice?: "auto" | "none" | { type: "function"; function: { name: string } };
  requiredTool?: string;
};
type ErrorCode = "unavailable" | "invalid_response" | "required_tool" | "authentication" | "quota" | "configuration" | "timeout" | "rate_limit" | "unsupported_tool";
const descriptions: Record<ErrorCode, string> = {
  unavailable: "Live Nebius AI is temporarily unavailable. Please retry.",
  invalid_response: "Live Nebius AI returned an incomplete or invalid reply after retrying. Please try again.",
  required_tool: "Live Nebius AI did not prepare the required action after retrying. Please try again.",
  authentication: "Live Nebius AI could not authenticate. Check the server API key and its permissions.",
  quota: "Live Nebius AI has no available credit or quota. Check the provider account before retrying.",
  configuration: "Live Nebius AI rejected the server configuration. Check the configured model and request settings.",
  timeout: "Live Nebius AI did not finish in time. Please retry.",
  rate_limit: "Live Nebius AI is busy. Please wait before trying again.",
  unsupported_tool: "Unsupported agent action. No transaction was performed.",
};
export class NebiusError extends Error {
  code: ErrorCode;
  status: number;
  constructor(code: ErrorCode) {
    super(descriptions[code]); this.name = "NebiusError"; this.code = code;
    this.status = code === "timeout" ? 504 : code === "rate_limit" ? 429 : ["authentication", "quota", "configuration"].includes(code) ? 503 : 502;
  }
}
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const retryable = (error: NebiusError) => ["unavailable", "invalid_response", "required_tool", "rate_limit"].includes(error.code);

function validated(body: unknown, request: NebiusRequest): NebiusMessage {
  const choices = record(body).choices;
  const choice = record(Array.isArray(choices) ? choices[0] : undefined), message = record(choice.message);
  if (message.role !== "assistant" || !["stop", "tool_calls"].includes(String(choice.finish_reason)) || (message.tool_calls != null && !Array.isArray(message.tool_calls)))
    throw new NebiusError("invalid_response");
  const calls = message.tool_calls as unknown[] | undefined;
  if (calls?.length) {
    if (calls.length > 8) throw new NebiusError("invalid_response");
    const allowed = new Set(request.tools?.map(item => record(record(item).function).name));
    const ids = new Set<string>();
    for (const item of calls) {
      const call = record(item), fn = record(call.function);
      if (typeof fn.name !== "string" || !fn.name) throw new NebiusError("invalid_response");
      if (!allowed.has(fn.name)) throw new NebiusError("unsupported_tool");
      if (typeof call.id !== "string" || !call.id || call.id.length > 200 || ids.has(call.id) || call.type !== "function" || typeof fn.arguments !== "string" || fn.arguments.length > 4000)
        throw new NebiusError("invalid_response");
      ids.add(call.id);
      let args: unknown;
      try { args = JSON.parse(fn.arguments); } catch { throw new NebiusError("invalid_response"); }
      if (args === null || typeof args !== "object" || Array.isArray(args)) throw new NebiusError("invalid_response");
    }
  } else if (typeof message.content !== "string" || !message.content.trim() || message.content.length > 6000 || choice.finish_reason !== "stop") {
    throw new NebiusError("invalid_response");
  }
  if (request.requiredTool && !calls?.some(item => record(record(item).function).name === request.requiredTool)) throw new NebiusError("required_tool");
  // Reasoning traces and provider metadata never enter the product or its saved conversation.
  return { role: "assistant", content: typeof message.content === "string" ? message.content : null,
    ...(calls?.length ? { tool_calls: calls as NebiusToolCall[] } : {}) };
}

function httpError(status: number, body: unknown) {
  const error = record(record(body).error);
  const reason = [error.code, error.type, error.message].filter(value => typeof value === "string").join(" ").toLowerCase();
  if (status === 401 || status === 403) return new NebiusError("authentication");
  if (status === 402 || /insufficient_quota|quota_exceeded|billing|payment_required|(?:credit|balance|budget).{0,30}(?:exhaust|insufficient|exceed)|(?:insufficient|exhausted).{0,30}(?:credit|balance|budget)/.test(reason)) return new NebiusError("quota");
  if (status === 429) return new NebiusError("rate_limit");
  if (status === 408 || status >= 500) return new NebiusError("unavailable");
  return new NebiusError("configuration");
}

/** One inference budget per user turn; callers execute tools only after an accepted response. */
export function createNebiusTurn({ deadline = Date.now() + 60000 }: { deadline?: number } = {}) {
  let retries = 0;
  return async function infer(request: NebiusRequest): Promise<NebiusMessage> {
    const key = process.env.NEBIUS_API_KEY?.trim();
    if (!key) throw new NebiusError("authentication");
    if (request.requiredTool && !request.tools?.some(item => record(record(item).function).name === request.requiredTool)) throw new NebiusError("configuration");
    const model = process.env.NEBIUS_MODEL || "nvidia/nemotron-3-super-120b-a12b";
    const body = JSON.stringify({ model, messages: request.messages, store: false,
      ...(request.tools?.length ? { tools: request.tools, tool_choice: request.requiredTool ? { type: "function", function: { name: request.requiredTool } } : request.toolChoice || "auto" } : {}),
      max_tokens: 1200,
      // NVIDIA documents thinking-off and these sampling values for this exact model family.
      ...(model.toLowerCase() === "nvidia/nemotron-3-super-120b-a12b"
        ? { chat_template_kwargs: { enable_thinking: false }, temperature: 1, top_p: .95 }
        : { temperature: .2 }),
    });
    for (;;) {
      if (Date.now() >= deadline) throw new NebiusError("timeout");
      let failure: NebiusError, retryAfter = 0;
      try {
        const response = await fetch(`${(process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.us-central1.nebius.com/v1").replace(/\/$/, "")}/chat/completions`, {
          method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body,
          signal: AbortSignal.timeout(Math.min(20000, Math.max(1, deadline - Date.now()))),
        });
        let data: unknown;
        try { data = await response.json(); } catch { if (response.ok) throw new NebiusError("invalid_response"); }
        if (Date.now() >= deadline) throw new NebiusError("timeout");
        if (response.ok) return validated(data, request);
        failure = httpError(response.status, data);
        const header = response.headers.get("retry-after");
        if (header) retryAfter = Math.max(0, /^\d+(?:\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now()) || 0;
      } catch (error) {
        failure = Date.now() >= deadline ? new NebiusError("timeout") : error instanceof NebiusError ? error : new NebiusError("unavailable");
      }
      if (!retryable(failure) || retries >= 2) throw failure;
      const delay = Math.max(retryAfter, 200 * 2 ** retries);
      if (delay >= deadline - Date.now()) throw failure;
      retries++;
      await wait(delay);
    }
  };
}
