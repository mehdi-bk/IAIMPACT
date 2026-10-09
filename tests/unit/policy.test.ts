import { beforeEach, describe, expect, it } from "vitest"
import { createSessionToken, lookupSession, type Principal } from "@/server/auth"
import { confirmAction, getCard, listAccounts, listTransactions, PolicyError, prepareAction } from "@/server/bank"
import { resetDemoData } from "@/server/db"
import { executeTool } from "@/server/tools/registry"

// Principals are built exactly like the route handlers do: from a session row.
function principal(customerId: string | null, channel: Principal["channel"] = "text"): Principal {
  const s = lookupSession(createSessionToken(customerId))!
  return { ...s, channel }
}

// Intl uses narrow no-break spaces in French amounts ("1 245,80 €").
const sp = (s: string) => s.replace(/[\u202f\u00a0]/g, " ")

beforeEach(() => resetDemoData({ clearSessions: true }))

describe("authentication", () => {
  it("visitor requesting a balance is denied", () => {
    const r = executeTool("get_account_balance", {}, principal(null))
    expect(r.ok).toBe(false)
    expect(r.error?.code).toBe("AUTH_REQUIRED")
    expect(sp(JSON.stringify(r))).not.toContain("1 245")
    expect(r.cards[0]?.kind).toBe("auth_required")
  })

  it("authenticated customer gets own balance from the database", () => {
    const r = executeTool("get_account_balance", {}, principal("cust_camille"))
    expect(r.ok).toBe(true)
    expect(sp((r.data as { balance: string }).balance)).toBe("1 245,80 €")
  })

  it("customer A cannot read customer B's account (by model-supplied id)", () => {
    const r = executeTool("get_account_balance", { account_id: "acc_luc_cc" }, principal("cust_camille"))
    expect(r.ok).toBe(false)
    expect(r.error?.code).toBe("NOT_FOUND")
    expect(sp(JSON.stringify(r))).not.toContain("3 120")
  })

  it("customer A cannot read customer B's transaction or card", () => {
    const camille = principal("cust_camille")
    expect(executeTool("get_transaction_details", { transaction_id: "tx_luc_89" }, camille).error?.code).toBe("NOT_FOUND")
    expect(executeTool("get_card_status", { card_id: "card_luc_mc" }, camille).error?.code).toBe("NOT_FOUND")
    expect(executeTool("open_transaction_details", { transaction_id: "tx_luc_89" }, camille).ui).toEqual([])
  })

  it("unknown or forged session tokens are rejected", () => {
    expect(lookupSession("forged-token-forged-token-forged")).toBeNull()
    expect(lookupSession(undefined)).toBeNull()
  })
})

describe("card management", () => {
  it("freeze requires confirmation: prepare alone does not change state", () => {
    const p = principal("cust_camille")
    const r = executeTool("prepare_card_freeze", { card_id: "card_cam_visa" }, p)
    expect(r.ok).toBe(true)
    expect(getCard(p, "card_cam_visa").status).toBe("ACTIVE")
  })

  it("confirmed freeze changes stored state", () => {
    const p = principal("cust_camille")
    const action = prepareAction(p, "CARD_FREEZE", "card_cam_visa")
    const done = confirmAction({ ...p, channel: "ui" }, action.id)
    expect(done.status).toBe("EXECUTED")
    expect(getCard(p, "card_cam_visa").status).toBe("FROZEN")
  })

  it("unauthorized card id is denied and creates nothing", () => {
    const p = principal("cust_camille")
    const r = executeTool("prepare_card_freeze", { card_id: "card_luc_mc" }, p)
    expect(r.error?.code).toBe("NOT_FOUND")
  })

  it("another session cannot confirm my pending action", () => {
    const p = principal("cust_camille")
    const action = prepareAction(p, "CARD_FREEZE", "card_cam_visa")
    expect(() => confirmAction(principal("cust_lucas", "ui"), action.id)).toThrow(PolicyError)
    expect(() => confirmAction(principal("cust_camille", "ui"), action.id)).toThrow(PolicyError) // same customer, other session
    expect(getCard(p, "card_cam_visa").status).toBe("ACTIVE")
  })

  it("the text model has no confirm tool", () => {
    const p = principal("cust_camille")
    const action = prepareAction(p, "CARD_FREEZE", "card_cam_visa")
    const r = executeTool("confirm_pending_action", { action_id: action.id }, p)
    expect(r.error?.code).toBe("UNKNOWN_TOOL")
    expect(getCard(p, "card_cam_visa").status).toBe("ACTIVE")
  })

  it("voice confirmation requires an explicit spoken yes", () => {
    const p = principal("cust_camille", "voice")
    const action = prepareAction(p, "CARD_FREEZE", "card_cam_visa")
    expect(executeTool("confirm_pending_action", { action_id: action.id }, p, { lastUserTranscript: "attends je réfléchis" }).ok).toBe(false)
    expect(getCard(p, "card_cam_visa").status).toBe("ACTIVE")
    expect(executeTool("confirm_pending_action", { action_id: action.id }, p, { lastUserTranscript: "Oui, je confirme." }).ok).toBe(true)
    expect(getCard(p, "card_cam_visa").status).toBe("FROZEN")
  })

  it("transfers require (simulated) step-up and update balances", () => {
    const p = principal("cust_camille")
    const r = executeTool("prepare_transfer", { beneficiary: "Sophie", amount_eur: 50 }, p)
    expect(r.ok).toBe(true)
    const id = (r.data as { pending_action_id: string }).pending_action_id
    expect(() => confirmAction({ ...p, channel: "ui" }, id)).toThrow(/validation renforcée/)
    confirmAction({ ...p, channel: "ui" }, id, { stepUp: true })
    expect(listAccounts(p)[0].balanceCents).toBe(124580 - 5000)
  })
})

describe("transactions", () => {
  it("returns the 89 € transaction for an approximate amount of 90 €", () => {
    const r = executeTool("get_transactions", { amount_approx_eur: 90 }, principal("cust_camille"))
    const txs = (r.data as { transactions: { id: string }[] }).transactions
    expect(txs[0].id).toBe("tx_cam_inconnu")
    expect(txs.map((t) => t.id)).not.toContain("tx_luc_89")
  })

  it("unknown transaction gives a safe empty result", () => {
    const r = executeTool("get_transactions", { amount_approx_eur: 4321 }, principal("cust_camille"))
    expect(r.ok).toBe(true)
    expect((r.data as { count: number }).count).toBe(0)
  })

  it("recent transactions come from the database, Camille only", () => {
    const p = principal("cust_camille")
    const txs = listTransactions(p, { limit: 100 })
    expect(txs.length).toBeGreaterThan(10)
    expect(txs.every((t) => t.accountId.startsWith("acc_cam"))).toBe(true)
  })

  it("injected instructions in transaction text are returned as quoted untrusted data", () => {
    const r = executeTool("get_transaction_details", { transaction_id: "tx_cam_virrecu" }, principal("cust_camille"))
    expect((r.data as { description: { untrusted_text: string } }).description.untrusted_text).toContain("IGNORE ALL PREVIOUS")
  })
})

describe("tool validation", () => {
  it("rejects invalid parameters and unknown pages", () => {
    const p = principal("cust_camille")
    expect(executeTool("navigate_to_page", { page: "https://evil.example" }, p).error?.code).toBe("INVALID_ARGUMENTS")
    expect(executeTool("prepare_card_limit_change", { card_id: "card_cam_visa", new_limit_eur: 999999 }, p).error?.code).toBe("INVALID_ARGUMENTS")
    expect(executeTool("does_not_exist", {}, p).error?.code).toBe("UNKNOWN_TOOL")
  })

  it("spending summary is computed from records", () => {
    const r = executeTool("calculate_spending_summary", { period: "this_month", category: "Restaurants" }, principal("cust_camille"))
    expect(sp((r.data as { total: string }).total)).toBe("61,30 €")
  })
})
