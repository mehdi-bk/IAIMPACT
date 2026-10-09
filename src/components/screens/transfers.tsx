"use client"
import { useState } from "react"
import Link from "next/link"
import { CircleCheckIcon, InfoIcon, SparklesIcon, UserRoundIcon } from "lucide-react"
import { api, ApiError, useAccounts, useBeneficiaries, usePendingAction, useSession } from "@/lib/api"
import { formatEUR } from "@/lib/format"
import type { PendingAction } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ActionButtons, ActionSummary } from "@/components/bank/action-confirm"
import { LockedState, Panel, ScreenHeader, Section } from "@/components/bank/ui"
import { usePageContext } from "@/components/shell/use-page"
import { useHighlight } from "@/components/shell/highlight"

/** Parses French amounts: "50", "50,5", "1 250,00" -> cents. */
function parseAmount(s: string): number | null {
  const clean = s.replace(/[\s  €]/g, "").replace(",", ".")
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null
  return Math.round(parseFloat(clean) * 100)
}

export function TransfersScreen() {
  usePageContext("virements")
  const { data: session } = useSession()
  const authed = !!session?.authenticated
  const { data: acc } = useAccounts(authed)
  const { data: bens } = useBeneficiaries(authed)
  const { data: pendingData, mutate: mutatePending } = usePendingAction(authed)
  const formHl = useHighlight("transfer-form")

  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)
  const [amount, setAmount] = useState("")
  const [reference, setReference] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [review, setReview] = useState<PendingAction | null>(null)
  const [busy, setBusy] = useState(false)

  if (session && !authed)
    return (
      <>
        <ScreenHeader title="Virement" back="/" />
        <LockedState what="vos virements" />
      </>
    )

  const accounts = acc?.accounts ?? []
  const fromId = from ?? accounts[0]?.id ?? null
  const compassDraft = pendingData?.action?.type === "TRANSFER" && pendingData.action.status === "PENDING" && !review ? pendingData.action : null
  const current = review ?? compassDraft

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const cents = parseAmount(amount)
    if (!fromId) return setError("Choisissez le compte à débiter.")
    if (!to) return setError("Choisissez un bénéficiaire.")
    if (!cents || cents <= 0) return setError("Saisissez un montant valide, par exemple 50 ou 50,00.")
    setBusy(true)
    try {
      const { action } = await api<{ action: PendingAction }>("/api/actions", {
        method: "POST",
        json: { op: "prepare", type: "TRANSFER", targetId: to, params: { fromAccountId: fromId, amountCents: cents, reference: reference.trim() } },
      })
      setReview(action)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible de préparer le virement.")
    } finally {
      setBusy(false)
    }
  }

  if (current) {
    const done = current.status === "EXECUTED"
    return (
      <div className="pb-8">
        <ScreenHeader title={done ? "Virement effectué" : "Vérifiez votre virement"} back="/" subtitle="Simulation — aucun argent réel ne circule" />
        <Section className="flex flex-col gap-4">
          {compassDraft && !review && (
            <p className="flex items-center gap-2 rounded-2xl bg-info-soft p-3 text-sm font-semibold text-navy">
              <SparklesIcon className="size-5 shrink-0 text-brand" aria-hidden /> Préparé avec Compass. Rien n&apos;est envoyé sans votre confirmation.
            </p>
          )}
          {done && (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <span className="flex size-16 items-center justify-center rounded-full bg-ok-soft text-ok">
                <CircleCheckIcon className="size-9" aria-hidden />
              </span>
              <p className="font-extrabold text-navy">Demande de démonstration exécutée</p>
            </div>
          )}
          <Panel>
            <ActionSummary action={current} />
          </Panel>
          <ActionButtons
            action={current}
            confirmLabel="Confirmer le virement"
            onDone={(a) => {
              setReview(a)
              void mutatePending()
            }}
          />
          {current.status !== "PENDING" && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setReview(null)
                  setAmount("")
                  setReference("")
                  void mutatePending()
                }}
                className="h-12 rounded-2xl bg-white font-bold text-navy ring-1 ring-line"
              >
                Nouveau virement
              </button>
              <Link href="/comptes" className="flex h-12 items-center justify-center rounded-2xl bg-navy font-bold text-white">
                Mes comptes
              </Link>
            </div>
          )}
        </Section>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="pb-8" noValidate>
      <ScreenHeader title="Faire un virement" back="/" subtitle="Simulation — aucun argent réel ne circule" />
      <div {...formHl} className="flex flex-col gap-5">
        <Section title="Depuis">
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Compte à débiter</legend>
            {accounts.map((a) => (
              <label key={a.id} className={cn("hc-outline flex min-h-16 items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-2", fromId === a.id ? "ring-navy" : "ring-transparent")}>
                <input type="radio" name="from" className="size-5 accent-[var(--navy)]" checked={fromId === a.id} onChange={() => setFrom(a.id)} />
                <span className="flex-1 text-sm font-bold text-navy">{a.label}</span>
                <span className="tabular text-sm font-bold text-navy">{formatEUR(a.balanceCents)}</span>
              </label>
            ))}
          </fieldset>
        </Section>
        <Section title="Vers">
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Bénéficiaire</legend>
            {bens?.beneficiaries
              .filter((b) => b.internalAccountId !== fromId)
              .map((b) => (
                <label key={b.id} className={cn("hc-outline flex min-h-16 items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-2", to === b.id ? "ring-navy" : "ring-transparent")}>
                  <input type="radio" name="to" className="size-5 accent-[var(--navy)]" checked={to === b.id} onChange={() => setTo(b.id)} />
                  <span className="flex size-9 items-center justify-center rounded-full bg-surface text-navy">
                    <UserRoundIcon className="size-5" aria-hidden />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-bold text-navy">{b.name}</span>
                    <span className="tabular block text-xs text-muted-ink">{b.maskedIban}</span>
                  </span>
                </label>
              ))}
          </fieldset>
        </Section>
        <Section title="Montant et motif">
          <Panel className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-muted-ink">Montant (€)</span>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="tabular h-14 rounded-xl bg-surface px-3 text-2xl font-extrabold text-navy outline-none focus:ring-2 focus:ring-brand"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-muted-ink">Motif (facultatif)</span>
              <input
                value={reference}
                maxLength={60}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Ex. remboursement dîner"
                className="h-12 rounded-xl bg-surface px-3 text-[15px] text-navy outline-none focus:ring-2 focus:ring-brand"
              />
            </label>
          </Panel>
        </Section>
        <Section className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="rounded-xl bg-brand-soft px-3 py-2 text-sm font-semibold text-brand">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className="h-12 rounded-2xl bg-brand font-bold text-white hover:bg-brand-strong disabled:opacity-60">
            {busy ? "Vérification…" : "Vérifier le virement"}
          </button>
          <p className="flex items-start gap-1.5 text-xs text-muted-ink">
            <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden /> Prototype : les virements sont simulés et ne mettent à jour que des comptes fictifs.
          </p>
        </Section>
      </div>
    </form>
  )
}
