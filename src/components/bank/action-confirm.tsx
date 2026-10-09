"use client"
import { useState } from "react"
import { CircleCheckIcon, LoaderCircleIcon, ShieldCheckIcon } from "lucide-react"
import { ApiError } from "@/lib/api"
import { cancelPendingAction, confirmPendingAction } from "@/lib/compass-client"
import type { PendingAction } from "@/lib/types"
import { cn } from "@/lib/utils"

export function ActionSummary({ action }: { action: PendingAction }) {
  return (
    <dl className="divide-y divide-line rounded-2xl bg-surface px-3.5 text-sm">
      {action.summary.map((s) => (
        <div key={s.label} className="flex items-start justify-between gap-3 py-2.5">
          <dt className="shrink-0 text-muted-ink">{s.label}</dt>
          <dd className="text-right font-bold text-navy">{s.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Confirm / cancel controls with explicit states: idle -> loading -> success
 * or error. The backend result (not the click) decides what is displayed.
 */
export function ActionButtons({
  action,
  onDone,
  confirmLabel = "Confirmer",
  compact,
}: {
  action: PendingAction
  onDone?: (a: PendingAction) => void
  confirmLabel?: string
  compact?: boolean
}) {
  const [state, setState] = useState<"idle" | "confirming" | "cancelling">("idle")
  const [error, setError] = useState<string | null>(null)

  if (action.status === "EXECUTED")
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-ok-soft px-3 py-2.5 text-sm font-bold text-ok" role="status">
        <CircleCheckIcon className="size-5 shrink-0" aria-hidden /> {action.result?.message ?? "Opération effectuée."}
      </p>
    )
  if (action.status !== "PENDING")
    return (
      <p className="rounded-2xl bg-surface px-3 py-2.5 text-sm font-semibold text-muted-ink" role="status">
        {action.status === "CANCELLED" ? "Demande annulée. Rien n'a été modifié." : action.status === "EXPIRED" ? "Demande expirée. Rien n'a été modifié." : "L'opération n'a pas abouti. Rien n'a été modifié."}
      </p>
    )

  const confirm = async () => {
    setError(null)
    setState("confirming")
    try {
      const done = await confirmPendingAction(action)
      onDone?.(done)
    } catch (e) {
      if (e instanceof Error && e.message === "STEP_UP_CANCELLED") setError("Validation annulée. Rien n'a été modifié.")
      else setError(e instanceof ApiError ? e.message : "L'opération n'a pas pu être réalisée. Rien n'a été modifié.")
    } finally {
      setState("idle")
    }
  }
  const cancel = async () => {
    setState("cancelling")
    try {
      onDone?.(await cancelPendingAction(action))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Impossible d'annuler pour le moment.")
    } finally {
      setState("idle")
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {action.requiresStepUp && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-ink">
          <ShieldCheckIcon className="size-4 text-navy" aria-hidden /> Validation renforcée requise (simulée)
        </p>
      )}
      <div className={cn("grid gap-2", compact ? "grid-cols-[1fr_auto]" : "grid-cols-1")}>
        <button
          type="button"
          onClick={confirm}
          disabled={state !== "idle"}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand px-4 font-bold text-white transition hover:bg-brand-strong disabled:opacity-70"
        >
          {state === "confirming" && <LoaderCircleIcon className="size-5 animate-spin" aria-hidden />}
          {state === "confirming" ? "Traitement…" : confirmLabel}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={state !== "idle"}
          className="flex h-12 items-center justify-center rounded-2xl px-4 text-sm font-bold text-navy ring-1 ring-line hover:bg-surface disabled:opacity-60"
        >
          Annuler
        </button>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-brand-soft px-3 py-2 text-sm font-semibold text-brand">
          {error}
        </p>
      )}
    </div>
  )
}
