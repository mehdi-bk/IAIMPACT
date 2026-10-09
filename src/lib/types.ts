// Shared API contract between the banking backend and the frontend.
// Everything here is plain JSON — no secrets, no full card numbers.

export type AccountType = "COMPTE_COURANT" | "LIVRET_A"
export type CardStatus = "ACTIVE" | "FROZEN" | "OPPOSED"
export type TxStatus = "COMPLETED" | "PENDING" | "REJECTED"

export interface Account {
  id: string
  type: AccountType
  label: string
  maskedIban: string
  balanceCents: number
  currency: "EUR"
  status: "OPEN" | "BLOCKED"
}

export interface Transaction {
  id: string
  accountId: string
  merchant: string
  label: string // raw bank statement label
  amountCents: number
  timestamp: string
  category: string
  status: TxStatus
  description: string
  channel: string
}

export interface Card {
  id: string
  accountId: string
  label: string
  kind: "PHYSICAL" | "VIRTUAL"
  network: "VISA" | "MASTERCARD"
  maskedNumber: string
  holder: string
  expiry: string
  status: CardStatus
  paymentLimitCents: number
  withdrawalLimitCents: number
  spentThisPeriodCents: number
  onlinePayments: boolean
  contactless: boolean
}

export interface Beneficiary {
  id: string
  name: string
  maskedIban: string
  internalAccountId: string | null
}

export interface Preferences {
  textScale: 1 | 1.15 | 1.3
  highContrast: boolean
  simplified: boolean
  reducedMotion: boolean
  voice: "marin" | "cedar"
  notifications: { operations: boolean; security: boolean; advice: boolean }
}

export interface SessionInfo {
  authenticated: boolean
  customer: { id: string; displayName: string; firstName: string; initials: string } | null
  preferences: Preferences
  demoProfiles: { id: string; displayName: string; description: string }[]
}

export type PendingActionType = "CARD_FREEZE" | "CARD_UNFREEZE" | "CARD_LIMIT_CHANGE" | "TRANSFER"

export interface PendingAction {
  id: string
  type: PendingActionType
  status: "PENDING" | "EXECUTED" | "CANCELLED" | "EXPIRED" | "FAILED"
  title: string
  summary: { label: string; value: string }[]
  requiresStepUp: boolean
  expiresAt: string
  result: { message: string } | null
}

export interface SupportHandoff {
  id: string
  category: string
  summary: HandoffSummary
  status: "DRAFT" | "SUBMITTED_DEMO" | "CANCELLED"
  createdAt: string
}

export interface HandoffSummary {
  client: string
  motif: string
  operation: string | null
  situation: string
  actions: string
  demande: string
}

export interface KnowledgeSource {
  id: string
  title: string
  url: string | null
  institution: string
  retrievedAt: string
  verified: boolean
}

// ---------------------------------------------------------------------------
// Navigation contract: the assistant may only target these routes/highlights.
// ---------------------------------------------------------------------------
export const APP_PAGES = {
  accueil: "/",
  comptes: "/comptes",
  operations: "/operations",
  cartes: "/cartes",
  virements: "/virements",
  profil: "/profil",
  connexion: "/connexion",
  conseiller: "/conseiller",
} as const
export type AppPage = keyof typeof APP_PAGES

export const HIGHLIGHTS = [
  "balance",
  "card-freeze",
  "card-limit",
  "card-security",
  "transaction",
  "spending",
  "transfer-form",
  "accessibility",
  "handoff",
] as const
export type Highlight = (typeof HIGHLIGHTS)[number]

/** Directives the backend sends to the UI. The frontend only interprets these. */
export type UiDirective =
  | { type: "navigate"; page: AppPage; highlight?: Highlight; transactionId?: string; cardId?: string }
  | { type: "refresh"; keys: ("accounts" | "transactions" | "cards" | "handoffs" | "session")[] }

/** Rich blocks rendered inside the assistant conversation. */
export type AssistantCard =
  | { kind: "balance"; accounts: Account[] }
  | { kind: "transactions"; title: string; transactions: Transaction[]; total?: number }
  | { kind: "transaction"; transaction: Transaction }
  | { kind: "cards"; cards: Card[] }
  | { kind: "confirmation"; action: PendingAction }
  | { kind: "options"; options: { label: string; message: string }[] }
  | { kind: "sources"; sources: KnowledgeSource[] }
  | { kind: "handoff"; handoff: SupportHandoff }
  | { kind: "spending"; spending: SpendingSummary }
  | { kind: "auth_required"; reason: string }
  | { kind: "privacy_warning"; redactions: string[] }

export interface SpendingSummary {
  periodLabel: string
  totalCents: number
  count: number
  byCategory: { category: string; totalCents: number; count: number }[]
  previous: { periodLabel: string; totalCents: number } | null
  category: string | null
  top: Transaction[]
}

export interface AppContext {
  page: AppPage
  selectedTransactionId?: string | null
  selectedCardId?: string | null
  selectedAccountId?: string | null
  workflow?: string | null
}

export interface TraceEvent {
  id: number
  at: string
  channel: "text" | "voice" | "ui"
  kind: "tool" | "intent" | "auth" | "action" | "llm"
  name: string
  decision: "ALLOWED" | "DENIED" | "ERROR" | "INFO"
  detail: string
}
