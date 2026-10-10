import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getProvider, providerStatus } from "@/server/llm/providers"

const { create, construct } = vi.hoisted(() => ({ create: vi.fn(), construct: vi.fn() }))
vi.mock("openai", () => ({ default: class {
  constructor(options: unknown) { construct(options) }
  chat = { completions: { create } }
} }))

beforeEach(() => {
  vi.clearAllMocks()
  for (const name of ["DEEPSEEK_API_KEY", "DEEPSEEK_MODEL", "DEEPSEEK_CLASSIFIER_MODEL", "LLM_PROVIDER", "GEMINI_API_KEY", "GEMINI_MODEL", "GEMINI_CLASSIFIER_MODEL", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"]) vi.stubEnv(name, "")
})
afterEach(() => vi.unstubAllEnvs())

const turnArgs = { system: "Banking assistant", messages: [{ role: "user" as const, content: "Mon solde ?" }], tools: [], onText: vi.fn() }
function gemini() {
  vi.stubEnv("LLM_PROVIDER", "gemini")
  vi.stubEnv("GEMINI_API_KEY", "fake-gemini-test-key")
  return getProvider()
}
function reply(message: object, finish_reason = "stop") {
  return { choices: [{ message: { role: "assistant", ...message }, finish_reason }] }
}

describe("Gemini text / OpenAI voice routing", () => {
  it("selects Gemini with both keys and keeps voice available", () => {
    vi.stubEnv("GEMINI_API_KEY", "fake-gemini-test-key")
    vi.stubEnv("OPENAI_API_KEY", "fake-openai-test-key")
    vi.stubEnv("ANTHROPIC_API_KEY", "unused")
    expect(providerStatus()).toMatchObject({ text: "gemini", voice: true })
    expect(getProvider().name).toBe("gemini")
    expect(construct).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "fake-gemini-test-key", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/" }))
  })
  it("does not fall back to paid OpenAI when selected Gemini key is missing", () => {
    vi.stubEnv("LLM_PROVIDER", "gemini")
    vi.stubEnv("OPENAI_API_KEY", "fake-openai-test-key")
    expect(providerStatus()).toMatchObject({ text: null, voice: true })
    expect(() => getProvider()).toThrow(/GEMINI_API_KEY/)
  })
  it("allows Gemini text without voice", () => {
    gemini()
    expect(providerStatus()).toMatchObject({ text: "gemini", voice: false })
  })
  it("rejects an unknown provider", () => {
    vi.stubEnv("LLM_PROVIDER", "typo")
    expect(() => getProvider()).toThrow()
  })
})

describe("Gemini tool loop", () => {
  it("preserves signatures and parallel tool results through JSON persistence", async () => {
    const provider = gemini()
    const native = { role: "assistant", content: null, tool_calls: [
      { id: "call-1", type: "function", function: { name: "get_balance", arguments: "{}" }, extra_content: { google: { thought_signature: "signature" } } },
      { id: "call-2", type: "function", function: { name: "get_cards", arguments: "{}" } },
    ] }
    create.mockResolvedValueOnce(reply(native, "tool_calls")).mockResolvedValueOnce(reply({ content: "Votre solde est de 1 245,80 €." }))
    const first = await provider.streamTurn({ ...turnArgs, tools: [{ name: "get_balance", description: "Balance", parameters: { type: "object", properties: {} } }] })
    expect(first.toolCalls).toHaveLength(2)
    expect(first.raw.content).toEqual(native)
    const persisted = JSON.parse(JSON.stringify({ role: "assistant", text: first.text, toolCalls: first.toolCalls, raw: first.raw }))
    const onText = vi.fn()
    await provider.streamTurn({ ...turnArgs, onText, messages: [...turnArgs.messages, persisted, { role: "tool", results: [
      { callId: "call-1", name: "get_balance", content: '{"balance":1245.8}' },
      { callId: "call-2", name: "get_cards", content: "[]" },
    ] }] })
    const sent = create.mock.calls[1][0].messages
    expect(sent[2]).toEqual(native)
    expect(sent[3]).toEqual({ role: "tool", tool_call_id: "call-1", content: '{"balance":1245.8}' })
    expect(sent[4].tool_call_id).toBe("call-2")
    expect(onText).toHaveBeenCalledWith("Votre solde est de 1 245,80 €.")
  })
  it("omits empty tool declarations and forwards cancellation", async () => {
    const provider = gemini()
    create.mockResolvedValue(reply({ content: "OK" }))
    const signal = new AbortController().signal
    await provider.streamTurn({ ...turnArgs, signal })
    expect(create.mock.calls[0][0]).not.toHaveProperty("tools")
    expect(create.mock.calls[0][1].signal).toBe(signal)
  })
  it("marks invalid tool JSON for validation instead of executing parsed partial data", async () => {
    const provider = gemini()
    create.mockResolvedValue(reply({ tool_calls: [{ id: "bad", type: "function", function: { name: "get_cards", arguments: "{" } }] }, "tool_calls"))
    expect((await provider.streamTurn(turnArgs)).toolCalls[0].args).toEqual({ __invalid_json: "{" })
  })
  it("rejects truncated responses and surfaces rate limits without fallback", async () => {
    const provider = gemini()
    create.mockResolvedValueOnce(reply({ content: "Partial" }, "length")).mockRejectedValueOnce(new Error("429 quota exceeded"))
    await expect(provider.streamTurn(turnArgs)).rejects.toThrow(/incomplète/)
    await expect(provider.streamTurn(turnArgs)).rejects.toThrow(/429/)
    expect(construct).toHaveBeenCalledTimes(1)
  })
  it("uses Gemini for structured intent classification", async () => {
    const provider = gemini()
    vi.stubEnv("GEMINI_CLASSIFIER_MODEL", "classifier-test")
    create.mockResolvedValue(reply({ content: '{"intent":"CARD_LOST"}' }))
    const schema = { type: "object", properties: { intent: { type: "string" } }, required: ["intent"] }
    expect(await provider.classify({ system: "Classify", input: "Carte perdue", schema })).toEqual({ intent: "CARD_LOST" })
    expect(create.mock.calls[0][0]).toMatchObject({ model: "classifier-test", response_format: { type: "json_schema", json_schema: { schema } } })
  })
})

describe("DeepSeek text / OpenAI voice", () => {
  function deepseek() {
    vi.stubEnv("LLM_PROVIDER", "deepseek")
    vi.stubEnv("DEEPSEEK_API_KEY", "fake-deepseek-test-key")
    return getProvider()
  }
  it("routes text to DeepSeek and keeps OpenAI for voice", async () => {
    vi.stubEnv("OPENAI_API_KEY", "fake-openai-test-key")
    vi.stubEnv("GEMINI_API_KEY", "unused-gemini")
    const provider = deepseek()
    create.mockResolvedValue(reply({ content: "OK" }))
    await provider.streamTurn(turnArgs)
    expect(providerStatus()).toMatchObject({ text: "deepseek", voice: true, textModel: "deepseek-flash" })
    expect(construct).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "fake-deepseek-test-key", baseURL: "https://api.deepseek.com" }))
    expect(create.mock.calls[0][0]).toMatchObject({ model: "deepseek-flash", reasoning_effort: "none" })
    expect(create.mock.calls[0][0]).not.toHaveProperty("tools")
  })
  it("never switches providers when the DeepSeek key is missing", () => {
    vi.stubEnv("LLM_PROVIDER", "deepseek")
    vi.stubEnv("OPENAI_API_KEY", "unused-openai")
    vi.stubEnv("GEMINI_API_KEY", "unused-gemini")
    expect(providerStatus()).toMatchObject({ text: null, voice: true })
    expect(() => getProvider()).toThrow(/DEEPSEEK_API_KEY/)
    expect(construct).not.toHaveBeenCalled()
  })
  it("uses JSON object mode and supplies the classifier schema", async () => {
    const provider = deepseek()
    create.mockResolvedValue(reply({ content: '{"intent":"CARD_LOST"}' }))
    const schema = { type: "object", properties: { intent: { type: "string" } } }
    expect(await provider.classify({ system: "Classify", input: "Carte perdue", schema })).toEqual({ intent: "CARD_LOST" })
    expect(create.mock.calls[0][0]).toMatchObject({ response_format: { type: "json_object" }, reasoning_effort: "none", max_tokens: 1024 })
    expect(create.mock.calls[0][0].messages[0].content).toContain(JSON.stringify(schema))
  })
  it("replays tool calls after persistence without Gemini metadata leaking across providers", async () => {
    const provider = deepseek()
    const native = { role: "assistant", content: null, tool_calls: [{ id: "deepseek-call", type: "function", function: { name: "get_cards", arguments: "{}" } }] }
    create.mockResolvedValueOnce(reply(native, "tool_calls")).mockResolvedValueOnce(reply({ content: "Carte active" }))
    const result = await provider.streamTurn({ ...turnArgs, tools: [{ name: "get_cards", description: "Cards", parameters: { type: "object", properties: {} } }] })
    expect(result.raw.provider).toBe("deepseek")
    const stored = JSON.parse(JSON.stringify({ role: "assistant", text: result.text, toolCalls: result.toolCalls, raw: result.raw }))
    await provider.streamTurn({ ...turnArgs, messages: [...turnArgs.messages, stored, { role: "tool", results: [{ callId: "deepseek-call", name: "get_cards", content: "[]" }] }] })
    expect(create.mock.calls[1][0].messages[2]).toEqual(native)
    expect(create.mock.calls[1][0].messages[3]).toEqual({ role: "tool", tool_call_id: "deepseek-call", content: "[]" })
    const old = { ...stored, raw: { provider: "gemini", model: "deepseek-flash", content: { ...native, extra_content: { signature: "old" } } } }
    create.mockResolvedValue(reply({ content: "OK" }))
    await provider.streamTurn({ ...turnArgs, messages: [old] })
    expect(create.mock.calls[2][0].messages[1]).not.toHaveProperty("extra_content")
  })
  it("surfaces API failure without paid fallback", async () => {
    const provider = deepseek()
    create.mockRejectedValue(new Error("402 insufficient balance"))
    await expect(provider.streamTurn(turnArgs)).rejects.toThrow(/402/)
    expect(construct).toHaveBeenCalledTimes(1)
  })
})
