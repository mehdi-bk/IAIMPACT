"use client"
import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ExternalLinkIcon, EyeOffIcon, GaugeIcon, GlobeIcon, LockIcon, LockOpenIcon, NfcIcon, PhoneIcon, ShieldAlertIcon, SparklesIcon } from "lucide-react"
import { api, ApiError, refresh, useCards, useSession } from "@/lib/api"
import { askCompass } from "@/lib/compass-client"
import { formatEUR } from "@/lib/format"
import type { Card, PendingAction } from "@/lib/types"
import { cn } from "@/lib/utils"
import { BankCardVisual, CardStatusPill } from "@/components/bank/bank-card"
import { ActionButtons, ActionSummary } from "@/components/bank/action-confirm"
import { LockedState, Panel, ScreenHeader, Section, SkeletonRows } from "@/components/bank/ui"
import { Switch } from "@/components/ui/switch"
import { Sheet } from "@/components/shell/sheet"
import { toast } from "@/components/shell/toast"
import { usePageContext } from "@/components/shell/use-page"
import { useHighlight } from "@/components/shell/highlight"

export function CardsScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const { data: session } = useSession()
  const authed = !!session?.authenticated
  const { data } = useCards(authed)
  const cards = data?.cards ?? []
  const card = cards.find((c) => c.id === params.get("card")) ?? cards.find((c) => c.kind === "PHYSICAL") ?? cards[0]
  usePageContext("cartes", { selectedCardId: card?.id ?? null })

  const [pending, setPending] = useState<PendingAction | null>(null)
  const [limitOpen, setLimitOpen] = useState(false)
  const [oppositionOpen, setOppositionOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const freezeHl = useHighlight<HTMLButtonElement>("card-freeze")
  const limitHl = useHighlight("card-limit")
  const securityHl = useHighlight("card-security")

  if (session && !authed)
    return (
      <>
        <ScreenHeader title="Mes cartes" />
        <LockedState what="vos cartes" />
      </>
    )
  if (!card)
    return (
      <>
        <ScreenHeader title="Mes cartes" />
        <div className="px-4">
          <div className="skeleton aspect-[1.586/1] rounded-[22px]" />
          <SkeletonRows n={3} />
        </div>
      </>
    )

  const prepare = async (type: PendingAction["type"], params?: Record<string, unknown>) => {
    setBusy(true)
    try {
      const { action } = await api<{ action: PendingAction }>("/api/actions", { method: "POST", json: { op: "prepare", type, targetId: card.id, params } })
      setPending(action)
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Action impossible pour le moment.", "error")
    } finally {
      setBusy(false)
    }
  }

  const toggleOption = async (option: "onlinePayments" | "contactless", value: boolean) => {
    try {
      await api("/api/bank/cards", { method: "PATCH", json: { cardId: card.id, option, value } })
      await refresh(["cards"])
      toast(option === "onlinePayments" ? `Paiement à distance ${value ? "activé" : "désactivé"}` : `Sans contact ${value ? "activé" : "désactivé"}`)
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Modification impossible.", "error")
    }
  }

  const frozen = card.status === "FROZEN"
  const used = Math.min(100, (card.spentThisPeriodCents / card.paymentLimitCents) * 100)

  return (
    <div className="pb-8">
      <ScreenHeader title="Mes cartes" />
      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2" role="tablist" aria-label="Choisir une carte">
        {cards.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={c.id === card.id}
            onClick={() => router.replace(`/cartes?card=${c.id}`, { scroll: false })}
            className={cn("w-[86%] shrink-0 snap-center transition-opacity", c.id !== card.id && "opacity-55")}
          >
            <BankCardVisual card={c} />
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-5 pt-3">
        <Section>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-extrabold text-navy">{card.label}</p>
              <p className="tabular text-xs text-muted-ink">•••• {card.maskedNumber} · expire {card.expiry}</p>
            </div>
            <CardStatusPill status={card.status} />
          </div>
        </Section>

        <Section>
          <button
            type="button"
            {...freezeHl}
            disabled={busy || card.status === "OPPOSED"}
            onClick={() => prepare(frozen ? "CARD_UNFREEZE" : "CARD_FREEZE")}
            className={cn(
              "hc-outline flex w-full items-center gap-4 rounded-3xl p-4 text-left shadow-sm transition",
              frozen ? "bg-navy text-white" : "bg-white text-navy hover:bg-white/80",
            )}
          >
            <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl", frozen ? "bg-white/15" : "bg-brand-soft text-brand")}>
              {frozen ? <LockOpenIcon className="size-6" aria-hidden /> : <LockIcon className="size-6" aria-hidden />}
            </span>
            <span className="flex-1">
              <span className="block font-extrabold">{frozen ? "Déverrouiller la carte" : "Verrouiller temporairement"}</span>
              <span className={cn("block text-xs", frozen ? "text-white/75" : "text-muted-ink")}>
                {frozen ? "Votre carte est verrouillée : paiements et retraits bloqués." : "Bloque paiements et retraits. Réversible à tout moment."}
              </span>
            </span>
          </button>
        </Section>

        <Section title="Plafonds">
          <Panel {...limitHl} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <GaugeIcon className="size-5 text-navy" aria-hidden />
              <div className="flex-1">
                <div className="flex justify-between text-sm">
                  <span className="font-bold text-navy">Paiements · 30 jours</span>
                  <span className="tabular font-bold text-navy">{formatEUR(card.paymentLimitCents)}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(used)} aria-label="Plafond de paiement utilisé">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${used}%` }} />
                </div>
                <p className="tabular mt-1 text-xs text-muted-ink">
                  {formatEUR(card.spentThisPeriodCents)} utilisés · {formatEUR(Math.max(0, card.paymentLimitCents - card.spentThisPeriodCents))} disponibles
                </p>
              </div>
            </div>
            {card.withdrawalLimitCents > 0 && (
              <p className="flex justify-between border-t border-line pt-3 text-sm">
                <span className="font-bold text-navy">Retraits · 7 jours</span>
                <span className="tabular font-bold text-navy">{formatEUR(card.withdrawalLimitCents)}</span>
              </p>
            )}
            <button type="button" onClick={() => setLimitOpen(true)} disabled={card.status !== "ACTIVE"} className="h-11 rounded-2xl bg-surface text-sm font-bold text-navy hover:bg-line disabled:opacity-50">
              Modifier mon plafond de paiement
            </button>
          </Panel>
        </Section>

        <Section title="Options">
          <Panel className="flex flex-col divide-y divide-line py-1">
            {(
              [
                { key: "onlinePayments", icon: GlobeIcon, label: "Paiement à distance", value: card.onlinePayments },
                { key: "contactless", icon: NfcIcon, label: "Sans contact", value: card.contactless },
              ] as const
            ).map((o) => (
              <label key={o.key} className="flex min-h-14 items-center gap-3">
                <o.icon className="size-5 text-navy" aria-hidden />
                <span className="flex-1 text-sm font-bold text-navy">{o.label}</span>
                <Switch checked={o.value} onCheckedChange={(v) => toggleOption(o.key, v)} aria-label={o.label} className="data-checked:bg-ok" />
              </label>
            ))}
          </Panel>
        </Section>

        <Section title="Sécurité">
          <Panel {...securityHl} className="flex flex-col gap-1 p-2">
            <button type="button" onClick={() => setOppositionOpen(true)} className="flex min-h-14 items-center gap-3 rounded-2xl px-2 text-left hover:bg-surface">
              <ShieldAlertIcon className="size-5 text-brand" aria-hidden />
              <span className="flex-1">
                <span className="block text-sm font-bold text-navy">Perte ou vol : faire opposition</span>
                <span className="block text-xs text-muted-ink">Procédure officielle et numéro d&apos;urgence</span>
              </span>
            </button>
            <div className="flex min-h-14 items-center gap-3 px-2">
              <EyeOffIcon className="size-5 text-muted-ink" aria-hidden />
              <span className="flex-1">
                <span className="block text-sm font-bold text-navy">Code secret et cryptogramme</span>
                <span className="block text-xs text-muted-ink">Jamais affichés ni stockés dans ce prototype</span>
              </span>
            </div>
            <button type="button" onClick={() => askCompass("J'ai une question sur la sécurité de ma carte")} className="flex min-h-14 items-center gap-3 rounded-2xl px-2 text-left hover:bg-surface">
              <SparklesIcon className="size-5 text-brand" aria-hidden />
              <span className="flex-1 text-sm font-bold text-navy">Une question ? Demander à Compass</span>
            </button>
          </Panel>
        </Section>
      </div>

      <Sheet open={!!pending} onClose={() => setPending(null)} title={pending?.title ?? ""} description="Vérifiez avant de confirmer.">
        {pending && (
          <div className="flex flex-col gap-4">
            <ActionSummary action={pending} />
            <ActionButtons
              action={pending}
              onDone={(a) => {
                setPending(a)
                if (a.status === "EXECUTED") {
                  toast(a.result?.message ?? "C'est fait.")
                  setTimeout(() => setPending(null), 900)
                }
              }}
            />
          </div>
        )}
      </Sheet>

      <LimitSheet key={`${card.id}-${card.paymentLimitCents}-${limitOpen}`} open={limitOpen} card={card} onClose={() => setLimitOpen(false)} onPrepare={(cents) => {
        setLimitOpen(false)
        void prepare("CARD_LIMIT_CHANGE", { newLimitCents: cents })
      }} />

      <Sheet open={oppositionOpen} onClose={() => setOppositionOpen(false)} title="Faire opposition" description="Source vérifiée — Caisse d'Épargne, consultée le 10/10/2026">
        <div className="flex flex-col gap-3 text-sm text-navy">
          <p>
            En cas de perte, de vol ou d&apos;usage frauduleux, faites opposition sans tarder depuis votre espace client ou par téléphone, 24h/24 et 7j/7 :
          </p>
          <a href="tel:+33969363939" className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-navy font-bold text-white">
            <PhoneIcon className="size-5" aria-hidden /> 09 69 36 39 39
          </a>
          <p className="text-xs text-muted-ink">Depuis l&apos;international : +33 9 69 36 39 39. Appel non surtaxé. L&apos;opposition est définitive, contrairement au verrouillage temporaire.</p>
          <p className="rounded-2xl bg-warn-soft p-3 text-xs font-semibold text-warn">
            Prototype : l&apos;opposition définitive n&apos;est pas simulée ici. Vous pouvez verrouiller la carte immédiatement en attendant.
          </p>
          {!frozen && (
            <button type="button" onClick={() => { setOppositionOpen(false); void prepare("CARD_FREEZE") }} className="h-12 rounded-2xl bg-brand font-bold text-white">
              Verrouiller ma carte maintenant
            </button>
          )}
          <a
            href="https://www.caisse-epargne.fr/nous-contacter/perte-vol-usage-frauduleux-moyens-paiement/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-xs font-bold text-brand"
          >
            Voir la source <ExternalLinkIcon className="size-3.5" aria-hidden />
          </a>
        </div>
      </Sheet>
    </div>
  )
}

function LimitSheet({ open, card, onClose, onPrepare }: { open: boolean; card: Card; onClose: () => void; onPrepare: (cents: number) => void }) {
  const presets = [100000, 150000, 250000, 300000]
  const [value, setValue] = useState(card.paymentLimitCents)
  return (
    <Sheet open={open} onClose={onClose} title="Plafond de paiement" description="Sur 30 jours glissants. Entre 100 € et 5 000 €.">
      <div className="flex flex-col gap-4">
        <p className="tabular text-center text-4xl font-extrabold text-navy" aria-live="polite">
          {formatEUR(value)}
        </p>
        <input
          type="range"
          min={10000}
          max={500000}
          step={10000}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          aria-label="Nouveau plafond de paiement"
          aria-valuetext={formatEUR(value)}
          className="w-full accent-[var(--brand)]"
        />
        <div className="grid grid-cols-4 gap-2">
          {presets.map((p) => (
            <button key={p} type="button" onClick={() => setValue(p)} aria-pressed={value === p} className={cn("h-10 rounded-xl text-sm font-bold", value === p ? "bg-navy text-white" : "bg-surface text-navy")}>
              {formatEUR(p).replace(",00", "")}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={value === card.paymentLimitCents}
          onClick={() => onPrepare(value)}
          className="h-12 rounded-2xl bg-brand font-bold text-white disabled:opacity-50"
        >
          Continuer
        </button>
      </div>
    </Sheet>
  )
}
