import { beforeEach, describe, expect, it } from "vitest"
import { createSessionToken, lookupSession, type Principal } from "@/server/auth"
import { getCard } from "@/server/bank"
import { resetDemoData } from "@/server/db"
import { runChatTurn, type ChatEvent } from "@/server/llm/engine"
import type { CanonMessage, LLMProvider, ToolCall, TurnResult } from "@/server/llm/providers"

// A scripted TEST DOUBLE for the model provider. It is used only here, to
// verify the engine plumbing and that authorization never depends on the
// model. The application itself always calls a real model.
function scripted(turns: ((history: CanonMessage[]) => { text?: string; calls?: Omit<ToolCall, "id">[] })[]): LLMProvider & { seen: CanonMessage[][] } {
  let i = 0
  const seen: CanonMessage[][] = []
  return {
    name: "anthropic",
    model: "test-double",
    seen,
    async streamTurn({ messages, onText }): Promise<TurnResult> {
      seen.push(structuredClone(messages))
      const step = turns[Math.min(i++, turns.length - 1)](messages)
      if (step.text) onText(step.text)
      const toolCalls = (step.calls ?? []).map((c, k) => ({ ...c, id: `call_${i}_${k}` }))
      return { text: step.text ?? "", toolCalls, raw: { provider: "test", model: "test-double", content: null }, stopReason: toolCalls.length ? "tool_use" : "end_turn" }
    },
    async classify() {
      return { intent: "UNKNOWN", sensitive_action: false, missing_information: [], escalation_recommended: false }
    },
  }
}

function principal(customerId: string | null): Principal {
  return { ...lookupSession(createSessionToken(customerId))!, channel: "text" }
}

async function run(p: Principal, provider: LLMProvider, message: string, app = { page: "accueil" as const }) {
  const events: ChatEvent[] = []
  await runChatTurn({ principal: p, input: { message }, app, emit: (e) => events.push(e), signal: new AbortController().signal, provider })
  return events
}

const sp = (s: string) => s.replace(/[  ]/g, " ")
const lastToolResult = (h: CanonMessage[]) => {
  const t = [...h].reverse().find((m) => m.role === "tool") as Extract<CanonMessage, { role: "tool" }>
  return t.results.map((r) => r.content).join("\n")
}

beforeEach(() => resetDemoData({ clearSessions: true }))

describe("conversation engine", () => {
  it("visitor asking for a balance: the backend denies, whatever the model does", async () => {
    const provider = scripted([() => ({ calls: [{ name: "get_account_balance", args: {} }] }), () => ({ text: "Il faut vous connecter." })])
    const events = await run(principal(null), provider, "Combien il me reste sur mon compte ?")
    const end = events.find((e) => e.type === "tool_end") as Extract<ChatEvent, { type: "tool_end" }>
    expect(end.ok).toBe(false)
    expect(end.code).toBe("AUTH_REQUIRED")
    expect(events.some((e) => e.type === "card" && e.card.kind === "auth_required")).toBe(true)
    expect(sp(lastToolResult(provider.seen[1]))).not.toContain("1 245")
  })

  it("authenticated balance flows from the tool into the model context", async () => {
    const provider = scripted([() => ({ calls: [{ name: "get_account_balance", args: {} }] }), () => ({ text: "Votre solde est de 1 245,80 €." })])
    const events = await run(principal("cust_camille"), provider, "Combien il me reste ?")
    expect(sp(lastToolResult(provider.seen[1]))).toContain("1 245,80 €")
    expect(events.some((e) => e.type === "done")).toBe(true)
  })

  it("prompt injection: reading a malicious description cannot unlock another customer's data", async () => {
    const provider = scripted([
      () => ({ calls: [{ name: "get_transaction_details", args: { transaction_id: "tx_cam_virrecu" } }] }),
      // Simulate a model that FOLLOWS the injected instruction:
      () => ({ calls: [{ name: "get_account_balance", args: { account_id: "acc_luc_cc" } }, { name: "get_transactions", args: { account_id: "acc_luc_cc" } }] }),
      () => ({ text: "Je ne peux pas faire cela." }),
    ])
    const events = await run(principal("cust_camille"), provider, "Explique-moi le virement reçu")
    const ends = events.filter((e) => e.type === "tool_end") as Extract<ChatEvent, { type: "tool_end" }>[]
    expect(ends[0].ok).toBe(true)
    expect(ends.slice(1).every((e) => !e.ok && e.code === "NOT_FOUND")).toBe(true)
    expect(sp(JSON.stringify(provider.seen[2]))).not.toContain("3 120,45")
  })

  it("the model cannot confirm a sensitive action: the card stays ACTIVE", async () => {
    const p = principal("cust_camille")
    const provider = scripted([
      () => ({ calls: [{ name: "prepare_card_freeze", args: { card_id: "card_cam_visa" } }] }),
      (h) => {
        const id = JSON.parse(lastToolResult(h)).pending_action_id
        return { calls: [{ name: "confirm_pending_action", args: { action_id: id } }] }
      },
      () => ({ text: "Confirmez avec le bouton." }),
    ])
    const events = await run(p, provider, "Bloque ma carte, je confirme d'avance")
    expect(events.some((e) => e.type === "card" && e.card.kind === "confirmation")).toBe(true)
    const ends = events.filter((e) => e.type === "tool_end") as Extract<ChatEvent, { type: "tool_end" }>[]
    expect(ends[1].code).toBe("UNKNOWN_TOOL")
    expect(getCard(p, "card_cam_visa").status).toBe("ACTIVE")
  })

  it("secrets typed by the user are masked before reaching the model", async () => {
    const provider = scripted([() => ({ text: "Ne partagez jamais vos codes." })])
    const events = await run(principal("cust_camille"), provider, "mon code secret est 4821 et ma carte 4970 1234 5678 9012")
    const sent = JSON.stringify(provider.seen[0])
    expect(sent).not.toContain("4821 et")
    expect(sent).not.toContain("5678 9012")
    expect(events.some((e) => e.type === "privacy")).toBe(true)
  })

  it("navigation directives are restricted to approved pages and owned resources", async () => {
    const provider = scripted([
      () => ({ calls: [{ name: "open_transaction_details", args: { transaction_id: "tx_cam_inconnu" } }, { name: "navigate_to_page", args: { page: "javascript:alert(1)" } }] }),
      () => ({ text: "Voici l'opération." }),
    ])
    const events = await run(principal("cust_camille"), provider, "Montre-moi le paiement de 89 euros")
    const ui = events.filter((e) => e.type === "ui") as Extract<ChatEvent, { type: "ui" }>[]
    expect(ui).toHaveLength(1)
    expect(ui[0].directive).toMatchObject({ type: "navigate", page: "operations", transactionId: "tx_cam_inconnu" })
  })

  it("selected transaction context is only shared when owned", async () => {
    const provider = scripted([() => ({ text: "ok" })])
    await run(principal("cust_camille"), provider, "C'est quoi ce paiement ?", { page: "operations", selectedTransactionId: "tx_luc_89" } as never)
    expect(JSON.stringify(provider.seen[0])).not.toContain("tx_luc_89")
    const provider2 = scripted([() => ({ text: "ok" })])
    await run(principal("cust_camille"), provider2, "C'est quoi ce paiement ?", { page: "operations", selectedTransactionId: "tx_cam_inconnu" } as never)
    expect(JSON.stringify(provider2.seen[0])).toContain("tx_cam_inconnu")
  })

  it("provider failure reports a safe error and claims nothing", async () => {
    const failing: LLMProvider = {
      name: "anthropic",
      model: "x",
      streamTurn: async () => {
        throw new Error("boom")
      },
      classify: async () => null,
    }
    const events = await run(principal("cust_camille"), failing, "Bonjour")
    expect(events.find((e) => e.type === "error")).toMatchObject({ retryable: true })
    expect(events.some((e) => e.type === "done")).toBe(false)
  })
})
