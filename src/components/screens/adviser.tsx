"use client"
import { CalendarIcon, CircleCheckIcon, ExternalLinkIcon, MessageSquareTextIcon, PhoneIcon, SparklesIcon } from "lucide-react"
import { useHandoffs, useSession } from "@/lib/api"
import { askCompass } from "@/lib/compass-client"
import { formatDate } from "@/lib/format"
import { Panel, ScreenHeader, Section } from "@/components/bank/ui"
import { usePageContext } from "@/components/shell/use-page"
import { useHighlight } from "@/components/shell/highlight"

export function AdviserScreen() {
  usePageContext("conseiller")
  const { data: session } = useSession()
  const authed = !!session?.authenticated
  const { data } = useHandoffs(authed)
  const hl = useHighlight("handoff")

  return (
    <div className="pb-10">
      <ScreenHeader title="Contacter un conseiller" back="/" />
      <div className="flex flex-col gap-5">
        <Section>
          <Panel className="flex flex-col gap-3">
            <p className="text-sm text-navy">
              Expliquez votre situation à Compass : il prépare un résumé clair que vous relisez avant de le partager. Plus besoin de tout réexpliquer.
            </p>
            <button
              type="button"
              onClick={() => askCompass("Je voudrais parler à un conseiller.")}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand font-bold text-white hover:bg-brand-strong"
            >
              <SparklesIcon className="size-5" aria-hidden /> Préparer ma demande avec Compass
            </button>
          </Panel>
        </Section>

        {authed && (
          <Section title="Mes demandes">
            <div {...hl} className="flex flex-col gap-2">
              {!data?.handoffs.length && <p className="rounded-3xl bg-white p-4 text-sm text-muted-ink shadow-sm">Aucune demande pour le moment.</p>}
              {data?.handoffs.map((h) => (
                <Panel key={h.id} className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-extrabold text-navy">{h.summary.motif}</p>
                      <p className="text-xs text-muted-ink">{formatDate(h.createdAt)}</p>
                    </div>
                    <span className={h.status === "SUBMITTED_DEMO" ? "rounded-full bg-ok-soft px-2.5 py-1 text-xs font-bold text-ok" : "rounded-full bg-surface px-2.5 py-1 text-xs font-bold text-muted-ink"}>
                      {h.status === "SUBMITTED_DEMO" ? "Enregistrée (démo)" : "Annulée"}
                    </span>
                  </div>
                  {h.summary.operation && <p className="text-sm text-navy">Opération : {h.summary.operation}</p>}
                  <p className="text-sm text-navy">{h.summary.demande}</p>
                  {h.status === "SUBMITTED_DEMO" && (
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-ink">
                      <CircleCheckIcon className="size-4 text-ok" aria-hidden /> Demande de démonstration enregistrée — aucun conseiller réel ne la reçoit.
                    </p>
                  )}
                </Panel>
              ))}
            </div>
          </Section>
        )}

        <Section title="Autres moyens de contact">
          <Panel className="flex flex-col divide-y divide-line py-1 text-sm">
            <a href="tel:+33969363939" className="flex min-h-14 items-center gap-3">
              <PhoneIcon className="size-5 text-brand" aria-hidden />
              <span className="flex-1">
                <span className="block font-bold text-navy">Perte, vol, fraude carte : 09 69 36 39 39</span>
                <span className="block text-xs text-muted-ink">24h/24, 7j/7, non surtaxé — source Caisse d&apos;Épargne</span>
              </span>
            </a>
            <div className="flex min-h-14 items-center gap-3 opacity-70">
              <MessageSquareTextIcon className="size-5 text-navy" aria-hidden />
              <span className="flex-1">
                <span className="block font-bold text-navy">Messagerie sécurisée</span>
                <span className="block text-xs text-muted-ink">Non simulée dans ce prototype</span>
              </span>
            </div>
            <div className="flex min-h-14 items-center gap-3 opacity-70">
              <CalendarIcon className="size-5 text-navy" aria-hidden />
              <span className="flex-1">
                <span className="block font-bold text-navy">Rendez-vous en agence</span>
                <span className="block text-xs text-muted-ink">Non simulé dans ce prototype</span>
              </span>
            </div>
            <a href="https://www.caisse-epargne.fr/nous-contacter/" target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center gap-1.5 text-xs font-bold text-brand">
              Page de contact officielle <ExternalLinkIcon className="size-3.5" aria-hidden />
            </a>
          </Panel>
        </Section>
      </div>
    </div>
  )
}
