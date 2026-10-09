"use client"
import { useEffect } from "react"
import { useCompass } from "@/lib/store"
import type { AppPage } from "@/lib/types"

/** Each screen declares itself so the assistant receives the current page as context. */
export function usePageContext(page: AppPage, extra: { selectedTransactionId?: string | null; selectedCardId?: string | null; selectedAccountId?: string | null } = {}) {
  const { selectedTransactionId = null, selectedCardId = null, selectedAccountId = null } = extra
  useEffect(() => {
    useCompass.getState().setContext({ page, selectedTransactionId, selectedCardId, selectedAccountId })
  }, [page, selectedTransactionId, selectedCardId, selectedAccountId])
}
