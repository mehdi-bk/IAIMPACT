import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"

// ============================================================================
// Model provider abstraction. The conversation engine only sees this
// interface; Claude (Anthropic) and OpenAI are interchangeable through env.
//   LLM_PROVIDER=anthropic|openai (default: anthropic if ANTHROPIC_API_KEY set)
// ============================================================================

export interface ToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ToolCall {
  id: string
  name: string
  args: unknown
}

/** Provider-neutral conversation history (persisted in SQLite). */
export type CanonMessage =
  | { role: "user"; content: string }
  // `raw` keeps the provider's native output (e.g. thinking blocks) so it can
  // be replayed unchanged on the next turn, as the APIs require.
  | { role: "assistant"; text: string; toolCalls: ToolCall[]; raw?: { provider: string; model: string; content: unknown } }
  | { role: "tool"; results: { callId: string; name: string; content: string; isError?: boolean }[] }

export interface TurnResult {
  text: string
  toolCalls: ToolCall[]
  raw: { provider: string; model: string; content: unknown }
  stopReason: string
}

export interface LLMProvider {
  name: "anthropic" | "openai"
  model: string
  streamTurn(args: {
    system: string
    messages: CanonMessage[]
    tools: ToolSpec[]
    onText: (delta: string) => void
    signal?: AbortSignal
  }): Promise<TurnResult>
  /** Small JSON-only call (intent classification). */
  classify(args: { system: string; input: string; schema: Record<string, unknown>; signal?: AbortSignal }): Promise<unknown>
}

export class ProviderUnavailableError extends Error {}

export function providerStatus() {
  const anthropic = !!process.env.ANTHROPIC_API_KEY
  const openai = !!process.env.OPENAI_API_KEY
  const chosen = (process.env.LLM_PROVIDER as "anthropic" | "openai" | undefined) ?? (anthropic ? "anthropic" : openai ? "openai" : null)
  return {
    anthropic,
    openai,
    text: chosen && ((chosen === "anthropic" && anthropic) || (chosen === "openai" && openai)) ? chosen : null,
    textModel: chosen === "openai" ? openaiModel() : anthropicModel(),
    voice: openai,
  }
}

const anthropicModel = () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5"
const openaiModel = () => process.env.OPENAI_TEXT_MODEL || "gpt-6.1-sol"

export function getProvider(): LLMProvider {
  const s = providerStatus()
  if (s.text === "anthropic") return anthropicProvider()
  if (s.text === "openai") return openaiProvider()
  throw new ProviderUnavailableError("Aucun fournisseur de modèle configuré (ANTHROPIC_API_KEY ou OPENAI_API_KEY).")
}

// ---------------------------------------------------------------------------
// Anthropic (Claude) — Messages API, streaming manual tool loop
// ---------------------------------------------------------------------------
function toAnthropicMessages(messages: CanonMessage[], model: string): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = []
  const pushUser = (blocks: Anthropic.ContentBlockParam[]) => {
    const last = out[out.length - 1]
    if (last && last.role === "user" && Array.isArray(last.content)) last.content.push(...blocks)
    else out.push({ role: "user", content: blocks })
  }
  for (const m of messages) {
    if (m.role === "user") pushUser([{ type: "text", text: m.content }])
    else if (m.role === "tool") {
      pushUser(
        m.results.map((r) => ({ type: "tool_result" as const, tool_use_id: r.callId, content: r.content, is_error: r.isError || undefined })),
      )
    } else if (m.raw && m.raw.provider === "anthropic" && m.raw.model === model) {
      out.push({ role: "assistant", content: m.raw.content as Anthropic.ContentBlockParam[] })
    } else {
      const blocks: Anthropic.ContentBlockParam[] = []
      if (m.text) blocks.push({ type: "text", text: m.text })
      for (const c of m.toolCalls) blocks.push({ type: "tool_use", id: c.id, name: c.name, input: c.args as Record<string, unknown> })
      if (blocks.length) out.push({ role: "assistant", content: blocks })
    }
  }
  return out
}

function anthropicProvider(): LLMProvider {
  const client = new Anthropic({ maxRetries: 2, timeout: 60_000 })
  const model = anthropicModel()
  const effort = (process.env.ANTHROPIC_EFFORT as "low" | "medium" | "high" | undefined) || "low"
  const useFallback = process.env.ANTHROPIC_SERVER_FALLBACK !== "false"
  return {
    name: "anthropic",
    model,
    async streamTurn({ system, messages, tools, onText, signal }) {
      const params = {
        model,
        max_tokens: 8000,
        // Stable system prompt + tools are cached; per-turn context lives in messages.
        system: [{ type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } }],
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Tool.InputSchema })),
        messages: toAnthropicMessages(messages, model),
        thinking: { type: "adaptive" as const },
        output_config: { effort },
      }
      const run = async (withFallback: boolean): Promise<Anthropic.Message> => {
        if (withFallback) {
          // Server-side refusal fallback (beta): a declined request is retried on a fallback model in the same call.
          const stream = client.beta.messages.stream(
            { ...(params as unknown as Anthropic.Beta.MessageCreateParams), betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } as Anthropic.Beta.MessageCreateParams,
            { signal },
          )
          stream.on("text", (d: string) => onText(d))
          return (await stream.finalMessage()) as unknown as Anthropic.Message
        }
        const stream = client.messages.stream(params, { signal })
        stream.on("text", (d: string) => onText(d))
        return await stream.finalMessage()
      }
      let msg: Anthropic.Message
      try {
        msg = await run(useFallback)
      } catch (e) {
        // If the account does not have the server-side fallback beta, retry without it.
        if (useFallback && e instanceof Anthropic.BadRequestError && /fallback/i.test(e.message)) msg = await run(false)
        else throw e
      }
      if (msg.stop_reason === "refusal") {
        return { text: "", toolCalls: [], raw: { provider: "anthropic", model, content: [] }, stopReason: "refusal" }
      }
      const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("")
      const toolCalls = msg.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
        .map((b) => ({ id: b.id, name: b.name, args: b.input }))
      return { text, toolCalls, raw: { provider: "anthropic", model, content: msg.content }, stopReason: msg.stop_reason ?? "end_turn" }
    },
    async classify({ system, input, schema, signal }) {
      const res = await client.messages.create(
        {
          model: process.env.ANTHROPIC_CLASSIFIER_MODEL || "claude-haiku-4-5",
          max_tokens: 400,
          system,
          messages: [{ role: "user", content: input }],
          output_config: { format: { type: "json_schema", schema } },
        },
        { signal, timeout: 15_000 },
      )
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("")
      return JSON.parse(text)
    },
  }
}

// ---------------------------------------------------------------------------
// OpenAI — Responses API, streaming manual tool loop
// ---------------------------------------------------------------------------
type OAInput = OpenAI.Responses.ResponseInputItem

function toOpenAIInput(messages: CanonMessage[], model: string): OAInput[] {
  const out: OAInput[] = []
  for (const m of messages) {
    if (m.role === "user") out.push({ role: "user", content: m.content })
    else if (m.role === "tool") {
      for (const r of m.results) out.push({ type: "function_call_output", call_id: r.callId, output: r.content })
    } else if (m.raw && m.raw.provider === "openai" && m.raw.model === model) {
      out.push(...(m.raw.content as OAInput[]))
    } else {
      if (m.text) out.push({ role: "assistant", content: m.text })
      for (const c of m.toolCalls) out.push({ type: "function_call", call_id: c.id, name: c.name, arguments: JSON.stringify(c.args ?? {}) })
    }
  }
  return out
}

function openaiProvider(): LLMProvider {
  const client = new OpenAI({ maxRetries: 2, timeout: 60_000 })
  const model = openaiModel()
  return {
    name: "openai",
    model,
    async streamTurn({ system, messages, tools, onText, signal }) {
      const stream = await client.responses.create(
        {
          model,
          instructions: system,
          input: toOpenAIInput(messages, model),
          tools: tools.map((t) => ({ type: "function" as const, name: t.name, description: t.description, parameters: t.parameters, strict: false })),
          stream: true,
        },
        { signal },
      )
      let final: OpenAI.Responses.Response | null = null
      for await (const ev of stream) {
        if (ev.type === "response.output_text.delta") onText(ev.delta)
        else if (ev.type === "response.completed") final = ev.response
        else if (ev.type === "response.failed" || ev.type === "error") throw new Error("OpenAI response failed")
      }
      if (!final) throw new Error("OpenAI stream ended without a response")
      const output = final.output
      const text = output
        .filter((o): o is OpenAI.Responses.ResponseOutputMessage => o.type === "message")
        .flatMap((o) => o.content)
        .map((c) => (c.type === "output_text" ? c.text : ""))
        .join("")
      const toolCalls = output
        .filter((o): o is OpenAI.Responses.ResponseFunctionToolCall => o.type === "function_call")
        .map((o) => {
          let args: unknown = {}
          try {
            args = JSON.parse(o.arguments || "{}")
          } catch {
            args = { __invalid_json: o.arguments }
          }
          return { id: o.call_id, name: o.name, args }
        })
      return { text, toolCalls, raw: { provider: "openai", model, content: output }, stopReason: toolCalls.length ? "tool_use" : "end_turn" }
    },
    async classify({ system, input, schema, signal }) {
      const res = await client.responses.create(
        {
          model: process.env.OPENAI_CLASSIFIER_MODEL || model,
          instructions: system,
          input,
          text: { format: { type: "json_schema", name: "intent", schema, strict: true } },
        },
        { signal, timeout: 15_000 },
      )
      return JSON.parse(res.output_text)
    },
  }
}
