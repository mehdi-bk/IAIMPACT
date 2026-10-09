"use client"
import useSWR, { mutate } from "swr"
import type { Account, Beneficiary, Card, PendingAction, SessionInfo, SpendingSummary, SupportHandoff, Transaction } from "./types"

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.json !== undefined ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    credentials: "same-origin",
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? "ERROR", data?.error?.message ?? "Une erreur est survenue.")
  return data as T
}

const fetcher = <T,>(url: string) => api<T>(url)
const opts = { revalidateOnFocus: false, shouldRetryOnError: false }

export function useSession() {
  return useSWR<SessionInfo>("/api/session", fetcher, opts)
}

// Private data hooks only fire when authenticated.
export function useAccounts(enabled = true) {
  return useSWR<{ accounts: Account[] }>(enabled ? "/api/bank/accounts" : null, fetcher, opts)
}
export function useCards(enabled = true) {
  return useSWR<{ cards: Card[] }>(enabled ? "/api/bank/cards" : null, fetcher, opts)
}
export function useTransactions(params: Record<string, string | undefined> | null) {
  const qs = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString() : null
  return useSWR<{ transactions: Transaction[]; categories: string[] }>(qs !== null ? `/api/bank/transactions?${qs}` : null, fetcher, opts)
}
export function useTransaction(id: string | null) {
  return useSWR<{ transaction: Transaction }>(id ? `/api/bank/transactions?id=${encodeURIComponent(id)}` : null, fetcher, opts)
}
export function useBeneficiaries(enabled = true) {
  return useSWR<{ beneficiaries: Beneficiary[] }>(enabled ? "/api/bank/beneficiaries" : null, fetcher, opts)
}
export function useSpending(period: string, enabled = true) {
  return useSWR<{ spending: SpendingSummary }>(enabled ? `/api/bank/spending?period=${period}` : null, fetcher, opts)
}
export function useHandoffs(enabled = true) {
  return useSWR<{ handoffs: SupportHandoff[] }>(enabled ? "/api/handoffs" : null, fetcher, opts)
}
export function usePendingAction(enabled = true) {
  return useSWR<{ action: PendingAction | null }>(enabled ? "/api/actions" : null, fetcher, opts)
}

export type RefreshKey = "accounts" | "transactions" | "cards" | "handoffs" | "session"
export function refresh(keys: RefreshKey[] = ["accounts", "transactions", "cards", "handoffs", "session"]) {
  return mutate((key) => {
    if (typeof key !== "string") return false
    return keys.some((k) =>
      k === "session"
        ? key === "/api/session"
        : k === "accounts"
          ? key.startsWith("/api/bank/accounts") || key.startsWith("/api/bank/spending") || key === "/api/actions"
          : k === "transactions"
            ? key.startsWith("/api/bank/transactions") || key.startsWith("/api/bank/spending")
            : k === "cards"
              ? key.startsWith("/api/bank/cards") || key === "/api/actions"
              : key.startsWith("/api/handoffs"),
    )
  })
}

/** Refresh everything private (after login/logout/reset). */
export function refreshAll() {
  return mutate(() => true)
}
