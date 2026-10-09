"use client"
import { useState } from "react"
import Link from "next/link"
import {
  BadgeCheckIcon, ChevronRightIcon, CircleCheckIcon, ExternalLinkIcon, InfoIcon, LockIcon, PencilIcon, ShieldAlertIcon, TrendingDownIcon, TrendingUpIcon,
} from "lucide-react"
import { api, ApiError, refresh } from "@/lib/api"
import { applyDirective, sendToCompass, voiceBridge } from "@/lib/compass-client"
import { formatDate, formatEUR, formatShortDate } from "@/lib/format"
import { useCompass } from "@/lib/store"
import type { AssistantCard, HandoffSummary, PendingAction, SupportHandoff } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ActionButtons, ActionSummary } from "@/components/bank/action-confirm"
import { BankCardVisual, CardStatusPill } from "@/components/bank/bank-card"
import { Amount, CategoryIcon } from "@/components/bank/ui"

const box = "hc-outline rounded-2xl bg-white p-3 ring-1 ring-line"

function afterAction(a: PendingAction) {
  if (a.status !== "EXECUTED" && a.status !== "CANCELLED") return
  // The verified server result is handed back to the assistant (voice or text).
  if (useCompass.getState().voice && voiceBridge.onActionResult) voiceBridge.onActionResult(a)
  else void sendToCompass({ event: { type: "action_result", actionId: a.id } }, { hidden: true })
}

export function AssistantCardView({ card, interactive = true }: { card: AssistantCard; interactive?: boolean }) {
  switch (card.kind) {
    case "balance":
      return (
        <div className={cn(box, "flex flex-col divide-y divide-line py-1")}>
          {card.accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between py-2">
              <span>
                <span className="block text-sm font-bold text-navy">{a.label}</span>
                <span className="tabular block text-[11px] text-muted-ink">{a.maskedIban}</span>
              </span>
              <span className="tabular text-lg font-extrabold text-navy">{formatEUR(a.balanceCents)}</span>
            </div>
          ))}
        </div>
      )
    case "transactions":
      return (
        <div className={box}>
          <p className="mb-1 px-1 text-xs font-bold text-muted-ink">{card.title}</p>
          <ul>
            {card.transactions.slice(0, 5).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  disabled={!interactive}
                  onClick={() => applyDirective({ type: "navigate", page: "operations", transactionId: t.id, highlight: "transaction" })}
                  className="flex w-full items-center gap-2.5 rounded-xl px-1 py-1.5 text-left hover:bg-surface"
                >
                  <CategoryIcon category={t.category} merchant={t.merchant} className="size-8" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-navy">{t.merchant}</span>
                    <span className="block text-[11px] text-muted-ink">
                      {formatShortDate(t.timestamp)} · {t.status === "PENDING" ? "en attente" : t.category}
                    </span>
                  </span>
                  <Amount cents={t.amountCents} className="text-sm" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )
    case "transaction": {
      const t = card.transaction
      return (
        <div className={cn(box, "flex flex-col gap-2")}>
          <div className="flex items-center gap-2.5">
            <CategoryIcon category={t.category} merchant={t.merchant} className="size-9" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-navy">{t.merchant}</span>
              <span className="block text-[11px] text-muted-ink">{formatDate(t.timestamp)}</span>
            </span>
            <Amount cents={t.amountCents} />
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl bg-surface p-2.5 text-xs">
            <dt className="text-muted-ink">Libellé</dt>
            <dd className="break-words font-semibold text-navy">{t.label}</dd>
            <dt className="text-muted-ink">Statut</dt>
            <dd className="font-semibold text-navy">{t.status === "PENDING" ? "En attente" : t.amountCents < 0 ? "Débitée" : "Créditée"}</dd>
            <dt className="text-muted-ink">Canal</dt>
            <dd className="font-semibold text-navy">{t.channel}</dd>
          </dl>
          {interactive && (
            <button
              type="button"
              onClick={() => applyDirective({ type: "navigate", page: "operations", transactionId: t.id, highlight: "transaction" })}
              className="flex items-center justify-center gap-1 rounded-xl py-1.5 text-xs font-bold text-brand hover:bg-brand-soft"
            >
              Voir dans mes opérations <ChevronRightIcon className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      )
    }
    case "cards":
      return (
        <div className={cn(box, "flex flex-col gap-2")}>
          {card.cards.map((c) => (
            <div key={c.id} className="flex items-center gap-3">
              <div className="w-20 shrink-0">
                <BankCardVisual card={c} compact />
              </div>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-navy">
                  {c.label} <span className="tabular font-semibold text-muted-ink">{c.maskedNumber}</span>
                </span>
                <CardStatusPill status={c.status} />
              </span>
            </div>
          ))}
        </div>
      )
    case "confirmation":
      return <ConfirmationCard action={card.action} />
    case "options":
      return (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Propositions">
          {card.options.map((o) => (
            <button
              key={o.label}
              type="button"
              disabled={!interactive}
              onClick={() => sendToCompass({ message: o.message })}
              className="min-h-10 rounded-full bg-white px-3.5 py-2 text-left text-[13px] font-bold text-navy ring-1 ring-navy/20 transition hover:bg-navy hover:text-white disabled:opacity-50"
            >
              {o.label}
            </button>
          ))}
        </div>
      )
    case "sources":
      return (
        <div className={cn(box, "flex flex-col gap-1.5")}>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-ink">Sources</p>
          {card.sources.map((s) => (
            <div key={s.id} className="flex items-start gap-2">
              {s.verified ? <BadgeCheckIcon className="mt-0.5 size-4 shrink-0 text-ok" aria-label="Source vérifiée" /> : <InfoIcon className="mt-0.5 size-4 shrink-0 text-warn" aria-label="Explication générale non vérifiée" />}
              <div className="min-w-0 text-xs">
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-bold text-navy underline decoration-line underline-offset-2 hover:text-brand">
                    {s.title} <ExternalLinkIcon className="inline size-3" aria-hidden />
                  </a>
                ) : (
                  <span className="font-bold text-navy">{s.title}</span>
                )}
                <p className="text-muted-ink">
                  {s.institution}
                  {s.verified ? ` · vérifiée le ${new Date(s.retrievedAt).toLocaleDateString("fr-FR")}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )
    case "handoff":
      return <HandoffCard initial={card.handoff} />
    case "spending": {
      const s = card.spending
      const max = Math.max(1, ...s.byCategory.map((c) => c.totalCents))
      const diff = s.previous ? s.totalCents - s.previous.totalCents : null
      return (
        <div className={cn(box, "flex flex-col gap-2.5")}>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-ink">
                Dépenses {s.periodLabel}
                {s.category ? ` · ${s.category}` : ""}
              </p>
              <p className="tabular text-2xl font-extrabold text-navy">{formatEUR(s.totalCents)}</p>
            </div>
            <p className="text-xs text-muted-ink">{s.count} opérations</p>
          </div>
          {diff !== null && s.previous && (
            <p className={cn("flex items-center gap-1 text-xs font-bold", diff > 0 ? "text-warn" : "text-ok")}>
              {diff > 0 ? <TrendingUpIcon className="size-4" aria-hidden /> : <TrendingDownIcon className="size-4" aria-hidden />}
              {diff > 0 ? "+" : "−"}
              {formatEUR(Math.abs(diff))} par rapport {s.previous.periodLabel}
            </p>
          )}
          {!s.category && (
            <ul className="flex flex-col gap-1.5">
              {s.byCategory.slice(0, 5).map((c) => (
                <li key={c.category} className="text-xs">
                  <div className="flex justify-between font-bold text-navy">
                    <span>{c.category}</span>
                    <span className="tabular">{formatEUR(c.totalCents)}</span>
                  </div>
                  <div className="mt-0.5 h-1.5 rounded-full bg-surface">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(c.totalCents / max) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-muted-ink">Calculé par le serveur à partir de vos opérations.</p>
        </div>
      )
    }
    case "auth_required":
      return (
        <div className={cn(box, "flex items-center gap-3 bg-info-soft ring-0")}>
          <LockIcon className="size-5 shrink-0 text-navy" aria-hidden />
          <p className="flex-1 text-xs font-semibold text-navy">{card.reason}</p>
          <Link href="/connexion" onClick={() => useCompass.getState().setSheet("peek")} className="shrink-0 rounded-xl bg-navy px-3 py-2 text-xs font-bold text-white">
            Se connecter
          </Link>
        </div>
      )
    case "privacy_warning":
      return (
        <div className={cn(box, "flex items-start gap-3 bg-warn-soft ring-0")} role="alert">
          <ShieldAlertIcon className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
          <p className="text-xs font-semibold text-warn">
            Information sensible masquée ({card.redactions.join(", ")}) avant tout traitement. Ne communiquez jamais vos codes, même à votre banque.
          </p>
        </div>
      )
  }
}

function ConfirmationCard({ action }: { action: PendingAction }) {
  return (
    <div className={cn(box, "flex flex-col gap-3 ring-2 ring-navy/15")} aria-label={`Confirmation requise : ${action.title}`}>
      <p className="flex items-center gap-2 text-sm font-extrabold text-navy">
        <span className="flex size-6 items-center justify-center rounded-full bg-brand-soft text-brand">
          <LockIcon className="size-3.5" aria-hidden />
        </span>
        {action.title}
      </p>
      <ActionSummary action={action} />
      <ActionButtons action={action} compact onDone={afterAction} />
    </div>
  )
}

function HandoffCard({ initial }: { initial: SupportHandoff }) {
  const [h, setH] = useState(initial)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Omit<HandoffSummary, "client">>({ ...initial.summary })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const post = async (json: unknown) => {
    setBusy(true)
    setError(null)
    try {
      const { handoff } = await api<{ handoff: SupportHandoff }>("/api/handoffs", { method: "POST", json })
      setH(handoff)
      return handoff
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action impossible.")
      return null
    } finally {
      setBusy(false)
    }
  }
  const finish = async (op: "submit" | "cancel") => {
    const res = await post({ op, id: h.id })
    if (!res) return
    await refresh(["handoffs"])
    if (useCompass.getState().voice && voiceBridge.onHandoffResult) voiceBridge.onHandoffResult(res.status)
    else void sendToCompass({ event: { type: "handoff_result", handoffId: h.id } }, { hidden: true })
  }

  const fields: [keyof Omit<HandoffSummary, "client">, string][] = [
    ["motif", "Motif"],
    ["operation", "Opération concernée"],
    ["situation", "Situation"],
    ["actions", "Actions réalisées"],
    ["demande", "Demande"],
  ]

  return (
    <div className={cn(box, "flex flex-col gap-3 ring-2 ring-navy/15")}>
      <p className="text-sm font-extrabold text-navy">Résumé pour votre conseiller</p>
      {!editing ? (
        <dl className="flex flex-col gap-1.5 rounded-xl bg-surface p-3 text-xs">
          <div>
            <dt className="text-muted-ink">Client</dt>
            <dd className="font-semibold text-navy">{h.summary.client}</dd>
          </div>
          {fields.map(([k, label]) =>
            h.summary[k] ? (
              <div key={k}>
                <dt className="text-muted-ink">{label}</dt>
                <dd className="font-semibold text-navy">{h.summary[k]}</dd>
              </div>
            ) : null,
          )}
        </dl>
      ) : (
        <div className="flex flex-col gap-2">
          {fields.map(([k, label]) => (
            <label key={k} className="flex flex-col gap-1 text-xs">
              <span className="font-bold text-muted-ink">{label}</span>
              <textarea
                value={draft[k] ?? ""}
                onChange={(e) => setDraft({ ...draft, [k]: k === "operation" && !e.target.value ? null : e.target.value })}
                rows={k === "situation" ? 3 : 2}
                className="resize-none rounded-xl bg-surface p-2 text-sm text-navy outline-none focus:ring-2 focus:ring-brand"
              />
            </label>
          ))}
        </div>
      )}
      {h.status === "DRAFT" ? (
        editing ? (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={async () => (await post({ op: "edit", id: h.id, summary: draft })) && setEditing(false)} className="h-11 rounded-xl bg-navy text-sm font-bold text-white">
              Enregistrer
            </button>
            <button type="button" onClick={() => setEditing(false)} className="h-11 rounded-xl text-sm font-bold text-navy ring-1 ring-line">
              Annuler
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <button type="button" disabled={busy} onClick={() => finish("submit")} className="h-11 rounded-xl bg-brand text-sm font-bold text-white hover:bg-brand-strong">
              Confirmer le partage
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={busy} onClick={() => setEditing(true)} className="flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-bold text-navy ring-1 ring-line">
                <PencilIcon className="size-4" aria-hidden /> Modifier
              </button>
              <button type="button" disabled={busy} onClick={() => finish("cancel")} className="h-11 rounded-xl text-sm font-bold text-navy ring-1 ring-line">
                Annuler
              </button>
            </div>
            <p className="text-[11px] text-muted-ink">Rien n&apos;est partagé sans votre confirmation. Seul ce résumé serait transmis, pas la conversation.</p>
          </div>
        )
      ) : (
        <p className={cn("flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold", h.status === "SUBMITTED_DEMO" ? "bg-ok-soft text-ok" : "bg-surface text-muted-ink")} role="status">
          {h.status === "SUBMITTED_DEMO" ? (
            <>
              <CircleCheckIcon className="size-5 shrink-0" aria-hidden /> Demande de démonstration enregistrée
            </>
          ) : (
            "Demande annulée"
          )}
        </p>
      )}
      {h.status === "SUBMITTED_DEMO" && (
        <Link href="/conseiller" onClick={() => useCompass.getState().setSheet("peek")} className="text-center text-xs font-bold text-brand">
          Suivre ma demande
        </Link>
      )}
      {error && (
        <p role="alert" className="text-xs font-semibold text-brand">
          {error}
        </p>
      )}
    </div>
  )
}
