"use client"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { AccessibilityIcon, BellIcon, LogInIcon, LogOutIcon, MicIcon, ShieldCheckIcon, Trash2Icon, LockIcon } from "lucide-react"
import { api, refreshAll, useSession } from "@/lib/api"
import { useCompass } from "@/lib/store"
import type { Preferences, SessionInfo } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Panel, ScreenHeader, Section } from "@/components/bank/ui"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/shell/toast"
import { usePageContext } from "@/components/shell/use-page"
import { useHighlight } from "@/components/shell/highlight"
import { mutate } from "swr"

export async function savePrefs(update: Partial<Preferences>) {
  await mutate<SessionInfo>(
    "/api/session",
    async (cur) => {
      const prefs = await api<Preferences>("/api/preferences", { method: "PUT", json: update })
      return cur ? { ...cur, preferences: prefs } : cur
    },
    {
      optimisticData: (cur) => (cur ? { ...cur, preferences: { ...cur.preferences, ...update } } : (cur as unknown as SessionInfo)),
      rollbackOnError: true,
      revalidate: false,
    },
  )
}

function Row({ icon: Icon, label, hint, children }: { icon?: React.ComponentType<{ className?: string }>; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-14 items-center gap-3 py-2">
      {Icon && <Icon className="size-5 shrink-0 text-navy" aria-hidden />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-navy">{label}</p>
        {hint && <p className="text-xs text-muted-ink">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

export function ProfileScreen() {
  usePageContext("profil")
  const router = useRouter()
  const { data: session } = useSession()
  const a11yHl = useHighlight("accessibility")
  const [loggingOut, setLoggingOut] = useState(false)
  const prefs = session?.preferences
  if (!session || !prefs) return <ScreenHeader title="Profil" />

  const set = (u: Partial<Preferences>, msg?: string) =>
    savePrefs(u)
      .then(() => msg && toast(msg))
      .catch(() => toast("Préférence non enregistrée.", "error"))

  const logout = async () => {
    setLoggingOut(true)
    await api("/api/session", { method: "DELETE" })
    useCompass.getState().resetConversation()
    await refreshAll()
    toast("Vous êtes déconnecté (simulation).", "info")
    router.push("/")
  }

  return (
    <div className="pb-10">
      <ScreenHeader title="Profil et paramètres" />
      <div className="flex flex-col gap-5">
        <Section>
          <Panel className="flex items-center gap-4">
            <span className="flex size-14 items-center justify-center rounded-full bg-navy text-lg font-extrabold text-white">{session.customer?.initials ?? "?"}</span>
            <div className="flex-1">
              <p className="text-lg font-extrabold text-navy">{session.customer?.displayName ?? "Visiteur"}</p>
              <p className="text-xs text-muted-ink">{session.customer ? "Session de démonstration · profil fictif" : "Non connecté"}</p>
            </div>
            {!session.customer && (
              <button type="button" onClick={() => router.push("/connexion")} className="flex h-10 items-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-bold text-white">
                <LogInIcon className="size-4" aria-hidden /> Connexion
              </button>
            )}
          </Panel>
        </Section>

        <Section title="Accessibilité" id="accessibilite">
          <Panel {...a11yHl} className="flex flex-col divide-y divide-line py-1">
            <div className="py-3">
              <p id="ts-label" className="mb-2 text-sm font-bold text-navy">
                Taille du texte
              </p>
              <div role="radiogroup" aria-labelledby="ts-label" className="grid grid-cols-3 gap-2">
                {([1, 1.15, 1.3] as const).map((s) => (
                  <button
                    key={s}
                    role="radio"
                    aria-checked={prefs.textScale === s}
                    onClick={() => set({ textScale: s })}
                    className={cn("h-12 rounded-xl font-extrabold", prefs.textScale === s ? "bg-navy text-white" : "bg-surface text-navy")}
                    style={{ fontSize: `${14 * s}px` }}
                  >
                    {s === 1 ? "A" : s === 1.15 ? "A+" : "A++"}
                    <span className="sr-only">{` ${Math.round(s * 100)} %`}</span>
                  </button>
                ))}
              </div>
            </div>
            <Row icon={AccessibilityIcon} label="Mode simplifié" hint="Phrases courtes, sans jargon, une action à la fois">
              <Switch checked={prefs.simplified} onCheckedChange={(v) => set({ simplified: v }, v ? "Mode simplifié activé" : "Mode simplifié désactivé")} aria-label="Mode simplifié" className="data-checked:bg-ok" />
            </Row>
            <Row label="Contraste élevé" hint="Textes et contours plus marqués">
              <Switch checked={prefs.highContrast} onCheckedChange={(v) => set({ highContrast: v })} aria-label="Contraste élevé" className="data-checked:bg-ok" />
            </Row>
            <Row label="Réduire les animations" hint="Respecte aussi le réglage de votre appareil">
              <Switch checked={prefs.reducedMotion} onCheckedChange={(v) => set({ reducedMotion: v })} aria-label="Réduire les animations" className="data-checked:bg-ok" />
            </Row>
          </Panel>
        </Section>

        <Section title="Voix de Compass">
          <Panel className="flex flex-col gap-2">
            <Row icon={MicIcon} label="Voix de l'assistant" hint="Conversation vocale en temps réel (OpenAI Realtime)">
              <select
                value={prefs.voice}
                onChange={(e) => set({ voice: e.target.value as Preferences["voice"] })}
                aria-label="Voix de l'assistant"
                className="h-10 rounded-xl bg-surface px-3 text-sm font-bold text-navy"
              >
                <option value="marin">Marin</option>
                <option value="cedar">Cedar</option>
              </select>
            </Row>
            <p className="text-xs text-muted-ink">La transcription est toujours affichée. Toutes les démarches restent possibles par écrit.</p>
          </Panel>
        </Section>

        {session.customer && (
          <Section title="Notifications">
            <Panel className="flex flex-col divide-y divide-line py-1">
              {(
                [
                  ["operations", "Opérations sur mes comptes"],
                  ["security", "Alertes de sécurité"],
                  ["advice", "Conseils personnalisés"],
                ] as const
              ).map(([k, label]) => (
                <Row key={k} icon={BellIcon} label={label}>
                  <Switch
                    checked={prefs.notifications[k]}
                    onCheckedChange={(v) => set({ notifications: { ...prefs.notifications, [k]: v } })}
                    aria-label={label}
                    className="data-checked:bg-ok"
                  />
                </Row>
              ))}
            </Panel>
          </Section>
        )}

        <Section title="Sécurité">
          <Panel className="flex flex-col gap-2 text-sm text-navy">
            <p className="flex items-start gap-2">
              <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
              Connexion de démonstration : aucun identifiant, mot de passe ou code réel n&apos;est demandé ni conservé.
            </p>
            <p className="flex items-start gap-2">
              <LockIcon className="mt-0.5 size-5 shrink-0 text-navy" aria-hidden />
              Chaque accès à vos données est vérifié par le serveur. Les actions sensibles exigent votre confirmation.
            </p>
          </Panel>
        </Section>

        <Section title="Confidentialité">
          <Panel className="flex flex-col gap-3 text-sm text-navy">
            <p>
              Pour répondre, Compass transmet à un fournisseur d&apos;IA (Anthropic ou OpenAI selon la configuration) votre message et uniquement les données nécessaires renvoyées
              par les outils autorisés. Les codes et numéros de carte saisis par erreur sont masqués avant envoi. En mode vocal, l&apos;audio est traité par OpenAI et n&apos;est pas enregistré
              par l&apos;application.
            </p>
            <p className="text-xs text-muted-ink">Prototype : données fictives. Aucune conformité réglementaire n&apos;est revendiquée.</p>
            <button
              type="button"
              onClick={async () => {
                const id = useCompass.getState().conversationId
                await api("/api/chat/reset", { method: "POST", json: { conversationId: id } })
                useCompass.getState().resetConversation()
                toast("Conversation effacée.")
              }}
              className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-surface font-bold text-navy hover:bg-line"
            >
              <Trash2Icon className="size-4" aria-hidden /> Effacer ma conversation avec Compass
            </button>
          </Panel>
        </Section>

        {session.customer && (
          <Section>
            <button type="button" onClick={logout} disabled={loggingOut} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white font-bold text-brand ring-1 ring-line hover:bg-brand-soft">
              <LogOutIcon className="size-5" aria-hidden /> Se déconnecter
            </button>
          </Section>
        )}
      </div>
    </div>
  )
}
