import "server-only"
import { db, newId, nowIso, tx } from "./db"
import { audit, type Principal } from "./auth"
import { formatEUR } from "@/lib/format"
import type {
  Account,
  Beneficiary,
  Card,
  HandoffSummary,
  PendingAction,
  PendingActionType,
  SpendingSummary,
  SupportHandoff,
  Transaction,
} from "@/lib/types"

// ============================================================================
// Shared policy layer + banking repository.
// EVERY read or write of customer data goes through a function in this file,
// and every one of them derives the customer from the validated Principal.
// Text chat, voice and UI buttons all call the same functions.
// ============================================================================

export type PolicyCode = "AUTH_REQUIRED" | "NOT_FOUND" | "INVALID" | "CONFLICT" | "EXPIRED" | "STEP_UP_REQUIRED" | "INSUFFICIENT_FUNDS"

export class PolicyError extends Error {
  constructor(public code: PolicyCode, message: string) {
    super(message)
  }
}

export function requireCustomer(p: Principal): string {
  if (!p.customerId) {
    audit(p, "auth", "require_customer", "DENIED", "Session visiteur : authentification requise")
    throw new PolicyError("AUTH_REQUIRED", "Cette information nécessite d'être connecté à votre espace client.")
  }
  return p.customerId
}

// Resource lookups filter by owner in SQL: another customer's resource is
// indistinguishable from a non-existent one (no existence leak).
function notFound(kind: string): never {
  throw new PolicyError("NOT_FOUND", `${kind} introuvable pour ce client.`)
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>
const toAccount = (r: Row): Account => ({
  id: r.id as string,
  type: r.type as Account["type"],
  label: r.label as string,
  maskedIban: r.masked_iban as string,
  balanceCents: r.balance_cents as number,
  currency: "EUR",
  status: r.status as Account["status"],
})
const toTx = (r: Row): Transaction => ({
  id: r.id as string,
  accountId: r.account_id as string,
  merchant: r.merchant as string,
  label: r.label as string,
  amountCents: r.amount_cents as number,
  timestamp: r.timestamp as string,
  category: r.category as string,
  status: r.status as Transaction["status"],
  description: r.description as string,
  channel: r.channel as string,
})
const toCard = (r: Row): Card => ({
  id: r.id as string,
  accountId: r.account_id as string,
  label: r.label as string,
  kind: r.kind as Card["kind"],
  network: r.network as Card["network"],
  maskedNumber: r.masked_number as string,
  holder: r.holder as string,
  expiry: r.expiry as string,
  status: r.status as Card["status"],
  paymentLimitCents: r.payment_limit_cents as number,
  withdrawalLimitCents: r.withdrawal_limit_cents as number,
  spentThisPeriodCents: r.spent_period_cents as number,
  onlinePayments: !!r.online_payments,
  contactless: !!r.contactless,
})

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
export function listAccounts(p: Principal): Account[] {
  const cid = requireCustomer(p)
  return (db().prepare("SELECT * FROM accounts WHERE owner_id = ? ORDER BY sort").all(cid) as Row[]).map(toAccount)
}

export function getAccount(p: Principal, accountId: string): Account {
  const cid = requireCustomer(p)
  const r = db().prepare("SELECT * FROM accounts WHERE id = ? AND owner_id = ?").get(accountId, cid) as Row | undefined
  return r ? toAccount(r) : notFound("Compte")
}

export function mainAccount(p: Principal): Account {
  const accounts = listAccounts(p)
  return accounts.find((a) => a.type === "COMPTE_COURANT") ?? accounts[0] ?? notFound("Compte")
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------
export interface TxFilters {
  accountId?: string
  query?: string
  amountApprox?: number // euros, matches ±10 %
  minAmount?: number // euros (absolute value)
  maxAmount?: number
  category?: string
  direction?: "debit" | "credit"
  period?: "this_month" | "last_month" | "last_30_days" | "all"
  status?: Transaction["status"]
  limit?: number
}

export function periodRange(period: TxFilters["period"], now = new Date()): { from: Date | null; to: Date | null; label: string } {
  switch (period) {
    case "this_month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: null, label: "ce mois-ci" }
    case "last_month":
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 1),
        label: "le mois dernier",
      }
    case "last_30_days":
      return { from: new Date(now.getTime() - 30 * 86_400_000), to: null, label: "les 30 derniers jours" }
    default:
      return { from: null, to: null, label: "sur toute la période" }
  }
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

export function listTransactions(p: Principal, f: TxFilters = {}): Transaction[] {
  const cid = requireCustomer(p)
  if (f.accountId) getAccount(p, f.accountId) // ownership check
  const rows = db()
    .prepare(
      `SELECT t.* FROM transactions t JOIN accounts a ON a.id = t.account_id
       WHERE a.owner_id = ? ${f.accountId ? "AND t.account_id = ?" : ""} ORDER BY t.timestamp DESC`,
    )
    .all(...(f.accountId ? [cid, f.accountId] : [cid])) as Row[]
  const { from, to } = periodRange(f.period)
  const q = f.query ? norm(f.query) : null
  let out = rows.map(toTx).filter((t) => {
    const abs = Math.abs(t.amountCents) / 100
    if (from && new Date(t.timestamp) < from) return false
    if (to && new Date(t.timestamp) >= to) return false
    if (f.direction === "debit" && t.amountCents >= 0) return false
    if (f.direction === "credit" && t.amountCents <= 0) return false
    if (f.category && norm(t.category) !== norm(f.category)) return false
    if (f.status && t.status !== f.status) return false
    if (f.minAmount != null && abs < f.minAmount) return false
    if (f.maxAmount != null && abs > f.maxAmount) return false
    if (f.amountApprox != null && Math.abs(abs - f.amountApprox) > Math.max(1, f.amountApprox * 0.1)) return false
    if (q && !norm(`${t.merchant} ${t.label} ${t.category}`).includes(q)) return false
    return true
  })
  if (f.amountApprox != null) {
    out = out.sort((a, b) => Math.abs(Math.abs(a.amountCents) / 100 - f.amountApprox!) - Math.abs(Math.abs(b.amountCents) / 100 - f.amountApprox!))
  }
  return out.slice(0, Math.min(f.limit ?? 50, 100))
}

export function getTransaction(p: Principal, id: string): Transaction {
  const cid = requireCustomer(p)
  const r = db()
    .prepare("SELECT t.* FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE t.id = ? AND a.owner_id = ?")
    .get(id, cid) as Row | undefined
  return r ? toTx(r) : notFound("Opération")
}

export const CATEGORIES = [
  "Alimentation", "Restaurants", "Transports", "Abonnements", "Logement", "Santé", "Shopping", "Revenus", "Virements reçus", "Virements émis", "Épargne", "Non catégorisé",
]

export function spendingSummary(
  p: Principal,
  opts: { period: "this_month" | "last_month" | "last_30_days"; category?: string; comparePrevious?: boolean },
): SpendingSummary {
  const main = mainAccount(p)
  const debits = listTransactions(p, { accountId: main.id, period: opts.period, direction: "debit", category: opts.category, limit: 100 })
    .filter((t) => t.status !== "REJECTED" && t.category !== "Épargne")
  const by = new Map<string, { totalCents: number; count: number }>()
  for (const t of debits) {
    const e = by.get(t.category) ?? { totalCents: 0, count: 0 }
    e.totalCents += -t.amountCents
    e.count++
    by.set(t.category, e)
  }
  let previous: SpendingSummary["previous"] = null
  if (opts.comparePrevious && opts.period === "this_month") {
    // Compare with the same number of days of the previous month (fair comparison).
    const now = new Date()
    const prevFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevTo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate(), 23, 59, 59)
    const prev = listTransactions(p, { accountId: main.id, period: "last_month", direction: "debit", category: opts.category, limit: 100 })
      .filter((t) => t.category !== "Épargne" && new Date(t.timestamp) >= prevFrom && new Date(t.timestamp) <= prevTo)
    previous = {
      periodLabel: `du 1er au ${now.getDate()} du mois dernier`,
      totalCents: prev.reduce((s, t) => s - t.amountCents, 0),
    }
  }
  return {
    periodLabel: periodRange(opts.period).label,
    totalCents: debits.reduce((s, t) => s - t.amountCents, 0),
    count: debits.length,
    byCategory: [...by.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.totalCents - a.totalCents),
    previous,
    category: opts.category ?? null,
    top: [...debits].sort((a, b) => a.amountCents - b.amountCents).slice(0, 3),
  }
}

// ---------------------------------------------------------------------------
// Cards & beneficiaries
// ---------------------------------------------------------------------------
export function listCards(p: Principal): Card[] {
  const cid = requireCustomer(p)
  return (db().prepare("SELECT * FROM cards WHERE owner_id = ? ORDER BY kind, id").all(cid) as Row[]).map(toCard)
}

export function getCard(p: Principal, cardId: string): Card {
  const cid = requireCustomer(p)
  const r = db().prepare("SELECT * FROM cards WHERE id = ? AND owner_id = ?").get(cardId, cid) as Row | undefined
  return r ? toCard(r) : notFound("Carte")
}

export function listBeneficiaries(p: Principal): Beneficiary[] {
  const cid = requireCustomer(p)
  return (db().prepare("SELECT * FROM beneficiaries WHERE owner_id = ? ORDER BY name").all(cid) as Row[]).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    maskedIban: r.masked_iban as string,
    internalAccountId: (r.internal_account_id as string) ?? null,
  }))
}

export function getBeneficiary(p: Principal, id: string): Beneficiary {
  return listBeneficiaries(p).find((b) => b.id === id) ?? notFound("Bénéficiaire")
}

/** Simple card toggles from the cards screen (non-sensitive, own card only). */
export function setCardOption(p: Principal, cardId: string, option: "onlinePayments" | "contactless", value: boolean): Card {
  const card = getCard(p, cardId)
  const col = option === "onlinePayments" ? "online_payments" : "contactless"
  db().prepare(`UPDATE cards SET ${col} = ? WHERE id = ? AND owner_id = ?`).run(value ? 1 : 0, card.id, p.customerId)
  audit(p, "action", `card_option.${option}`, "ALLOWED", `${card.maskedNumber} -> ${value}`)
  return getCard(p, cardId)
}

// ---------------------------------------------------------------------------
// Sensitive actions: PREPARE -> (user) CONFIRM -> EXECUTE
// ---------------------------------------------------------------------------
const ACTION_TTL_MS = 5 * 60 * 1000

interface ActionRow {
  id: string
  customer_id: string
  session_hash: string
  type: PendingActionType
  target_id: string
  params: string
  status: PendingAction["status"]
  created_at: string
  expires_at: string
  result: string | null
}

function describeAction(p: Principal, row: ActionRow): Pick<PendingAction, "title" | "summary" | "requiresStepUp"> {
  const params = JSON.parse(row.params)
  switch (row.type) {
    case "CARD_FREEZE":
    case "CARD_UNFREEZE": {
      const card = getCard(p, row.target_id)
      return {
        title: row.type === "CARD_FREEZE" ? "Verrouiller temporairement la carte" : "Déverrouiller la carte",
        summary: [
          { label: "Carte", value: `${card.label} ${card.maskedNumber}` },
          {
            label: "Effet",
            value:
              row.type === "CARD_FREEZE"
                ? "Paiements et retraits bloqués. Réversible à tout moment."
                : "La carte pourra de nouveau être utilisée.",
          },
        ],
        requiresStepUp: false,
      }
    }
    case "CARD_LIMIT_CHANGE": {
      const card = getCard(p, row.target_id)
      return {
        title: "Modifier le plafond de paiement",
        summary: [
          { label: "Carte", value: `${card.label} ${card.maskedNumber}` },
          { label: "Plafond actuel", value: `${formatEUR(card.paymentLimitCents)} / 30 jours` },
          { label: "Nouveau plafond", value: `${formatEUR(params.newLimitCents)} / 30 jours` },
        ],
        requiresStepUp: true,
      }
    }
    case "TRANSFER": {
      const from = getAccount(p, params.fromAccountId)
      const ben = getBeneficiary(p, row.target_id)
      return {
        title: "Virement (simulé)",
        summary: [
          { label: "Depuis", value: `${from.label} — ${formatEUR(from.balanceCents)}` },
          { label: "Vers", value: `${ben.name} ${ben.maskedIban.slice(-4)}` },
          { label: "Montant", value: formatEUR(params.amountCents) },
          { label: "Motif", value: params.reference || "—" },
          { label: "Exécution", value: "Immédiate (simulation, aucun mouvement réel)" },
        ],
        requiresStepUp: true,
      }
    }
  }
}

function toPending(p: Principal, row: ActionRow): PendingAction {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    expiresAt: row.expires_at,
    result: row.result ? JSON.parse(row.result) : null,
    ...describeAction(p, row),
  }
}

function loadAction(p: Principal, actionId: string): ActionRow {
  const cid = requireCustomer(p)
  const row = db()
    .prepare("SELECT * FROM pending_actions WHERE id = ? AND customer_id = ? AND session_hash = ?")
    .get(actionId, cid, p.sessionHash) as ActionRow | undefined
  return row ?? notFound("Action")
}

export function getPendingAction(p: Principal, actionId: string): PendingAction {
  return toPending(p, loadAction(p, actionId))
}

export function prepareAction(
  p: Principal,
  type: PendingActionType,
  targetId: string,
  params: Record<string, unknown> = {},
): PendingAction {
  const cid = requireCustomer(p)
  // Validate the target and business preconditions BEFORE creating anything.
  if (type === "CARD_FREEZE" || type === "CARD_UNFREEZE" || type === "CARD_LIMIT_CHANGE") {
    const card = getCard(p, targetId)
    if (card.status === "OPPOSED") throw new PolicyError("CONFLICT", "Cette carte est en opposition définitive.")
    if (type === "CARD_FREEZE" && card.status === "FROZEN") throw new PolicyError("CONFLICT", "Cette carte est déjà verrouillée.")
    if (type === "CARD_UNFREEZE" && card.status !== "FROZEN") throw new PolicyError("CONFLICT", "Cette carte n'est pas verrouillée.")
    if (type === "CARD_LIMIT_CHANGE") {
      const v = Number(params.newLimitCents)
      if (!Number.isInteger(v) || v < 10000 || v > 500000) throw new PolicyError("INVALID", "Le plafond doit être compris entre 100 € et 5 000 €.")
      if (v === card.paymentLimitCents) throw new PolicyError("CONFLICT", "Ce plafond est déjà appliqué.")
    }
  } else if (type === "TRANSFER") {
    const ben = getBeneficiary(p, targetId)
    const from = getAccount(p, String(params.fromAccountId))
    const amount = Number(params.amountCents)
    if (!Number.isInteger(amount) || amount <= 0) throw new PolicyError("INVALID", "Montant invalide.")
    if (amount > 1_000_000) throw new PolicyError("INVALID", "Montant supérieur au plafond de virement de la démo (10 000 €).")
    if (ben.internalAccountId === from.id) throw new PolicyError("INVALID", "Le compte source et le compte destinataire sont identiques.")
    if (amount > from.balanceCents) throw new PolicyError("INSUFFICIENT_FUNDS", `Solde insuffisant sur ${from.label} (${formatEUR(from.balanceCents)}).`)
  }
  // Supersede older pending actions of the same type on the same target.
  db()
    .prepare("UPDATE pending_actions SET status = 'CANCELLED' WHERE customer_id = ? AND type = ? AND target_id = ? AND status = 'PENDING'")
    .run(cid, type, targetId)
  const now = Date.now()
  const id = newId("act")
  db()
    .prepare(
      "INSERT INTO pending_actions (id, customer_id, session_hash, type, target_id, params, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)",
    )
    .run(id, cid, p.sessionHash, type, targetId, JSON.stringify(params), new Date(now).toISOString(), new Date(now + ACTION_TTL_MS).toISOString())
  audit(p, "action", `prepare.${type}`, "ALLOWED", `${id} cible=${targetId} — en attente de confirmation utilisateur`)
  return getPendingAction(p, id)
}

export function cancelAction(p: Principal, actionId: string): PendingAction {
  const row = loadAction(p, actionId)
  if (row.status === "PENDING") db().prepare("UPDATE pending_actions SET status = 'CANCELLED' WHERE id = ?").run(row.id)
  audit(p, "action", `cancel.${row.type}`, "INFO", row.id)
  return getPendingAction(p, actionId)
}

/**
 * Executes a previously prepared action. Only reachable from an explicit user
 * gesture (button) or a verified spoken confirmation — never exposed as an
 * LLM tool in the text assistant. Preconditions are re-validated at execution.
 */
export function confirmAction(p: Principal, actionId: string, opts: { stepUp?: boolean } = {}): PendingAction {
  const row = loadAction(p, actionId)
  if (row.status !== "PENDING") throw new PolicyError("CONFLICT", "Cette demande a déjà été traitée ou annulée.")
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db().prepare("UPDATE pending_actions SET status = 'EXPIRED' WHERE id = ?").run(row.id)
    throw new PolicyError("EXPIRED", "La demande a expiré. Merci de la relancer.")
  }
  const { requiresStepUp } = describeAction(p, row)
  if (requiresStepUp && !opts.stepUp) {
    audit(p, "action", `confirm.${row.type}`, "DENIED", "Validation renforcée (simulée) requise")
    throw new PolicyError("STEP_UP_REQUIRED", "Une validation renforcée est nécessaire pour cette opération.")
  }
  const params = JSON.parse(row.params)
  const cid = p.customerId!
  let message = ""
  try {
    tx(() => {
      switch (row.type) {
        case "CARD_FREEZE": {
          const card = getCard(p, row.target_id)
          if (card.status !== "ACTIVE") throw new PolicyError("CONFLICT", "La carte n'est plus active.")
          db().prepare("UPDATE cards SET status = 'FROZEN' WHERE id = ? AND owner_id = ?").run(card.id, cid)
          message = `Carte ${card.maskedNumber} temporairement verrouillée.`
          break
        }
        case "CARD_UNFREEZE": {
          const card = getCard(p, row.target_id)
          if (card.status !== "FROZEN") throw new PolicyError("CONFLICT", "La carte n'est pas verrouillée.")
          db().prepare("UPDATE cards SET status = 'ACTIVE' WHERE id = ? AND owner_id = ?").run(card.id, cid)
          message = `Carte ${card.maskedNumber} déverrouillée.`
          break
        }
        case "CARD_LIMIT_CHANGE": {
          const card = getCard(p, row.target_id)
          db().prepare("UPDATE cards SET payment_limit_cents = ? WHERE id = ? AND owner_id = ?").run(params.newLimitCents, card.id, cid)
          message = `Plafond de paiement de la carte ${card.maskedNumber} fixé à ${formatEUR(params.newLimitCents)} / 30 jours.`
          break
        }
        case "TRANSFER": {
          const from = getAccount(p, params.fromAccountId)
          const ben = getBeneficiary(p, row.target_id)
          const amount = params.amountCents as number
          if (amount > from.balanceCents) throw new PolicyError("INSUFFICIENT_FUNDS", "Solde insuffisant.")
          const ts = nowIso()
          db().prepare("UPDATE accounts SET balance_cents = balance_cents - ? WHERE id = ? AND owner_id = ?").run(amount, from.id, cid)
          db()
            .prepare("INSERT INTO transactions (id, account_id, merchant, label, amount_cents, timestamp, category, status, description, channel) VALUES (?, ?, ?, ?, ?, ?, 'Virements émis', 'COMPLETED', ?, 'Virement (simulation)')")
            .run(newId("tx"), from.id, `Virement à ${ben.name}`, `VIR EMIS ${ben.name.toUpperCase()}`, -amount, ts, `Virement simulé${params.reference ? ` — ${params.reference}` : ""}. Aucun mouvement réel.`)
          if (ben.internalAccountId) {
            const to = getAccount(p, ben.internalAccountId)
            db().prepare("UPDATE accounts SET balance_cents = balance_cents + ? WHERE id = ? AND owner_id = ?").run(amount, to.id, cid)
            db()
              .prepare("INSERT INTO transactions (id, account_id, merchant, label, amount_cents, timestamp, category, status, description, channel) VALUES (?, ?, ?, ?, ?, ?, 'Épargne', 'COMPLETED', ?, 'Virement interne (simulation)')")
              .run(newId("tx"), to.id, `Virement depuis ${from.label}`, "VIR INTERNE", amount, ts, "Virement interne simulé.")
          }
          message = `Virement simulé de ${formatEUR(amount)} vers ${ben.name} effectué.`
          break
        }
      }
      db()
        .prepare("UPDATE pending_actions SET status = 'EXECUTED', result = ? WHERE id = ?")
        .run(JSON.stringify({ message }), row.id)
    })
  } catch (e) {
    audit(p, "action", `confirm.${row.type}`, "ERROR", e instanceof Error ? e.message : "erreur")
    if (e instanceof PolicyError) throw e
    db().prepare("UPDATE pending_actions SET status = 'FAILED' WHERE id = ?").run(row.id)
    throw new PolicyError("CONFLICT", "L'opération n'a pas pu être exécutée. Aucun changement n'a été appliqué.")
  }
  audit(p, "action", `confirm.${row.type}`, "ALLOWED", `${row.id} exécutée après confirmation utilisateur (${p.channel})`)
  return getPendingAction(p, actionId)
}

export function latestPendingAction(p: Principal): PendingAction | null {
  if (!p.customerId) return null
  const row = db()
    .prepare("SELECT * FROM pending_actions WHERE customer_id = ? AND session_hash = ? AND status = 'PENDING' ORDER BY created_at DESC LIMIT 1")
    .get(p.customerId, p.sessionHash) as ActionRow | undefined
  return row ? toPending(p, row) : null
}

// ---------------------------------------------------------------------------
// Human handoff (simulated support request)
// ---------------------------------------------------------------------------
const toHandoff = (r: Row): SupportHandoff => ({
  id: r.id as string,
  category: r.category as string,
  summary: JSON.parse(r.summary as string),
  status: r.status as SupportHandoff["status"],
  createdAt: r.created_at as string,
})

export function createHandoffDraft(p: Principal, category: string, summary: Omit<HandoffSummary, "client">): SupportHandoff {
  const cid = requireCustomer(p)
  const cust = db().prepare("SELECT display_name FROM customers WHERE id = ?").get(cid) as { display_name: string }
  const id = newId("sup")
  const full: HandoffSummary = { client: cust.display_name, ...summary }
  db()
    .prepare("INSERT INTO support_handoffs (id, customer_id, category, summary, status, created_at) VALUES (?, ?, ?, ?, 'DRAFT', ?)")
    .run(id, cid, category, JSON.stringify(full), nowIso())
  audit(p, "action", "handoff.draft", "ALLOWED", `${id} — ${category}`)
  return getHandoff(p, id)
}

export function getHandoff(p: Principal, id: string): SupportHandoff {
  const cid = requireCustomer(p)
  const r = db().prepare("SELECT * FROM support_handoffs WHERE id = ? AND customer_id = ?").get(id, cid) as Row | undefined
  return r ? toHandoff(r) : notFound("Demande")
}

export function listHandoffs(p: Principal): SupportHandoff[] {
  const cid = requireCustomer(p)
  return (db().prepare("SELECT * FROM support_handoffs WHERE customer_id = ? AND status != 'DRAFT' ORDER BY created_at DESC").all(cid) as Row[]).map(toHandoff)
}

export function updateHandoff(
  p: Principal,
  id: string,
  update: { action: "edit"; summary: Omit<HandoffSummary, "client"> } | { action: "submit" } | { action: "cancel" },
): SupportHandoff {
  const h = getHandoff(p, id)
  if (h.status !== "DRAFT") throw new PolicyError("CONFLICT", "Cette demande n'est plus modifiable.")
  if (update.action === "edit") {
    const s = { ...update.summary, client: h.summary.client }
    db().prepare("UPDATE support_handoffs SET summary = ? WHERE id = ?").run(JSON.stringify(s), id)
  } else {
    const status = update.action === "submit" ? "SUBMITTED_DEMO" : "CANCELLED"
    db().prepare("UPDATE support_handoffs SET status = ? WHERE id = ?").run(status, id)
    audit(p, "action", `handoff.${update.action}`, "ALLOWED", `${id} -> ${status} (aucun envoi réel)`)
  }
  return getHandoff(p, id)
}
