"use client"
import { useState } from "react"
import useSWR from "swr"
import { ActivityIcon, BotIcon, DatabaseIcon, MicIcon, PlayIcon, RotateCcwIcon, ShieldIcon, TerminalIcon } from "lucide-react"
import { api, refreshAll } from "@/lib/api"
import { askCompass } from "@/lib/compass-client"
import { useCompass } from "@/lib/store"
import type { SessionInfo } from "@/lib/types"
import { cn } from "@/lib/utils"

// DEMO ONLY. Rehearsal tool for the pitch; the API behind it is disabled in
// production and loopback-only. It is not part of the customer application.

interface DemoState {
  session: SessionInfo
  providers: { deepseek: boolean; gemini: boolean; anthropic: boolean; openai: boolean; text: string | null; textModel: string; voice: boolean }
  workflow: { intent: string; stage: string; missingInformation: string[]; pendingActionId: string | null } | null
  state: { camilleCard: string; submittedHandoffs: number }
  trace: { id: number; at: string; channel: string; kind: string; name: string; decision: string; detail: string }[]
}

const JOURNEYS = [
  {
    title: "A · Carte perdue",
    setup: "camille",
    steps: ["J'ai perdu ma carte bancaire.", "Verrouiller ma carte"],
    note: "Confirmer sur la carte de confirmation, puis vérifier l'écran Cartes.",
  },
  {
    title: "B · Paiement suspect",
    setup: "camille",
    steps: ["Je vois un paiement de 89 euros que je ne reconnais pas.", "Comment contester cette opération ?", "Je voudrais parler à un conseiller."],
    note: "Relire le résumé, « Confirmer le partage », puis ouvrir Conseiller.",
  },
  {
    title: "C · Accessibilité (voix)",
    setup: "visitor",
    steps: ["Bonjour, je voudrais savoir combien il me reste sur mon compte.", "Je ne comprends pas mes dépenses."],
    note: "En voix : poser la question en visiteur, se connecter (Camille), répéter, activer « Simplifié ».",
  },
]

const fetcher = (u: string) => api<DemoState>(u)

export function DemoPanel({ fullPage = false }: { fullPage?: boolean }) {
  const { data, error, mutate } = useSWR<DemoState>("/api/demo", fetcher, { refreshInterval: 1500, shouldRetryOnError: false })
  const workflow = useCompass((s) => s.workflow) ?? data?.workflow
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const op = async (body: Record<string, unknown>, label: string) => {
    setBusy(label)
    try {
      const r = await api<{ ok: boolean; message: string }>("/api/demo", { method: "POST", json: body })
      setMsg(`${r.ok ? "✓" : "✗"} ${r.message}`)
      if (["reset_all", "login", "logout", "reset_conversations"].includes(String(body.op))) useCompass.getState().resetConversation()
      await refreshAll()
      await mutate()
    } catch (e) {
      setMsg(`✗ ${e instanceof Error ? e.message : "Erreur"}`)
    } finally {
      setBusy(null)
    }
  }

  const current = data?.session.customer?.id === "cust_camille" ? "camille" : data?.session.customer?.id === "cust_lucas" ? "lucas" : "visitor"

  return (
    <aside
      aria-label="Panneau de démonstration"
      className={cn(
        "flex-col gap-3 overflow-hidden text-[13px] text-navy",
        fullPage ? "flex min-h-[100dvh] w-full bg-surface p-4" : "hidden h-[min(844px,calc(100dvh-40px))] w-[380px] shrink-0 lg:flex",
      )}
    >
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-extrabold">
          <TerminalIcon className="size-4" aria-hidden /> Panneau de démonstration
        </p>
        <span className="rounded-md bg-brand px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-white">DEMO ONLY</span>
      </div>

      {error ? (
        <p className="rounded-2xl bg-white p-4 text-muted-ink shadow-sm">Panneau désactivé (production ou accès non local).</p>
      ) : (
        <div className="no-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto pb-2">
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: DatabaseIcon, label: "Base", ok: true, value: "SQLite" },
              { icon: BotIcon, label: "IA texte", ok: !!data?.providers.text, value: data?.providers.text ? data.providers.textModel : "clé manquante" },
              { icon: MicIcon, label: "Voix", ok: !!data?.providers.voice, value: data?.providers.voice ? "Realtime" : "clé manquante" },
            ].map((r) => (
              <div key={r.label} className="rounded-2xl bg-white p-2.5 shadow-sm">
                <p className="flex items-center gap-1 text-[11px] font-bold text-muted-ink">
                  <r.icon className="size-3.5" aria-hidden /> {r.label}
                </p>
                <p className={cn("truncate text-xs font-extrabold", r.ok ? "text-ok" : "text-brand")} title={r.value}>
                  {r.ok ? "● " : "○ "}
                  {r.value}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl bg-white p-3 shadow-sm">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-ink">Session simulée</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(["visitor", "camille", "lucas"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={!!busy}
                  onClick={() => op(s === "visitor" ? { op: "logout" } : { op: "login", profile: s }, s)}
                  className={cn("h-9 rounded-xl text-xs font-extrabold", current === s ? "bg-navy text-white" : "bg-surface hover:bg-line")}
                >
                  {s === "visitor" ? "Visiteur" : s === "camille" ? "Camille" : "Lucas"}
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button type="button" disabled={!!busy} onClick={() => op({ op: "reset_all" }, "reset")} className="flex h-9 items-center justify-center gap-1 rounded-xl bg-brand text-xs font-extrabold text-white">
                <RotateCcwIcon className="size-3.5" aria-hidden /> Tout réinitialiser
              </button>
              <button type="button" disabled={!!busy} onClick={() => op({ op: "reset_conversations" }, "conv")} className="h-9 rounded-xl bg-surface text-xs font-bold hover:bg-line">
                Reset conversations
              </button>
              <button type="button" disabled={!!busy} onClick={() => op({ op: "restore_card" }, "card")} className="h-9 rounded-xl bg-surface text-xs font-bold hover:bg-line">
                Restaurer la carte
              </button>
              <button type="button" disabled={!!busy} onClick={() => op({ op: "restore_transaction" }, "tx")} className="h-9 rounded-xl bg-surface text-xs font-bold hover:bg-line">
                Restaurer op. 89 €
              </button>
              <button type="button" disabled={!!busy} onClick={() => op({ op: "test_llm" }, "llm")} className="h-9 rounded-xl bg-surface text-xs font-bold hover:bg-line">
                {busy === "llm" ? "Test…" : "Tester l'IA"}
              </button>
              <button type="button" disabled={!!busy} onClick={() => op({ op: "test_voice" }, "voice")} className="h-9 rounded-xl bg-surface text-xs font-bold hover:bg-line">
                {busy === "voice" ? "Test…" : "Tester la voix"}
              </button>
            </div>
            {msg && <p className="mt-2 rounded-lg bg-surface px-2 py-1.5 text-xs font-semibold">{msg}</p>}
            <p className="mt-2 text-[11px] text-muted-ink">
              État : carte de Camille <b>{data?.state.camilleCard ?? "…"}</b> · demandes conseiller <b>{data?.state.submittedHandoffs ?? 0}</b>
            </p>
          </div>

          <div className="rounded-2xl bg-white p-3 shadow-sm">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-ink">Parcours de démonstration</p>
            <div className="flex flex-col gap-2.5">
              {JOURNEYS.map((j) => (
                <div key={j.title}>
                  <p className="font-extrabold">{j.title}</p>
                  <ul className="mt-1 flex flex-col gap-1">
                    {j.steps.map((s) => (
                      <li key={s}>
                        <button type="button" onClick={() => askCompass(s)} className="flex w-full items-start gap-1.5 rounded-lg px-1.5 py-1 text-left text-xs hover:bg-surface">
                          <PlayIcon className="mt-0.5 size-3 shrink-0 text-brand" aria-hidden />« {s} »
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="px-1.5 text-[11px] text-muted-ink">{j.note}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-3 shadow-sm">
            <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted-ink">
              <ActivityIcon className="size-3.5" aria-hidden /> État du workflow
            </p>
            {workflow ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                <dt className="text-muted-ink">Intention</dt>
                <dd className="font-extrabold">{workflow.intent}</dd>
                <dt className="text-muted-ink">Étape</dt>
                <dd className="font-bold">{workflow.stage}</dd>
                <dt className="text-muted-ink">Manquant</dt>
                <dd>{workflow.missingInformation?.length ? workflow.missingInformation.join(", ") : "—"}</dd>
                <dt className="text-muted-ink">En attente</dt>
                <dd className="truncate">{workflow.pendingActionId ?? "—"}</dd>
              </dl>
            ) : (
              <p className="text-xs text-muted-ink">Aucune conversation.</p>
            )}
          </div>

          <div className="flex min-h-56 flex-1 flex-col rounded-2xl bg-[#0d1524] p-3 text-white shadow-sm">
            <p className="mb-2 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-white/60">
              <ShieldIcon className="size-3.5" aria-hidden /> Décisions du serveur (temps réel)
            </p>
            <ol className="no-scrollbar flex flex-1 flex-col gap-1.5 overflow-y-auto font-mono text-[11px]">
              {data?.trace.map((t) => (
                <li key={t.id} className="leading-snug">
                  <span className="text-white/40">{new Date(t.at).toLocaleTimeString("fr-FR")}</span>{" "}
                  <span
                    className={cn(
                      "rounded px-1 font-bold",
                      t.decision === "ALLOWED" && "bg-[#16805d]/30 text-[#6ee7b7]",
                      t.decision === "DENIED" && "bg-[#c8102e]/35 text-[#fda4af]",
                      t.decision === "ERROR" && "bg-[#b54708]/35 text-[#fcd34d]",
                      t.decision === "INFO" && "bg-white/10 text-white/70",
                    )}
                  >
                    {t.decision}
                  </span>{" "}
                  <span className="text-white/50">[{t.channel}]</span> <span className="font-bold">{t.name}</span> <span className="text-white/60">{t.detail}</span>
                </li>
              ))}
              {!data?.trace.length && <li className="text-white/40">En attente d&apos;activité…</li>}
            </ol>
          </div>
        </div>
      )}
    </aside>
  )
}
