"use client"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ChevronRightIcon, ShieldAlertIcon } from "lucide-react"
import { api, refreshAll, useSession } from "@/lib/api"
import { ScreenHeader, Section } from "@/components/bank/ui"
import { toast } from "@/components/shell/toast"
import { usePageContext } from "@/components/shell/use-page"

/**
 * Demo login selector. Deliberately NOT a credential form: no identifier,
 * password or code field exists anywhere in the prototype.
 */
export function LoginScreen() {
  usePageContext("connexion")
  const router = useRouter()
  const { data } = useSession()
  const [busy, setBusy] = useState<string | null>(null)

  const login = async (profile: string) => {
    setBusy(profile)
    try {
      await api("/api/session", { method: "POST", json: { profile } })
      await refreshAll()
      toast("Connecté (session de démonstration)")
      router.push("/")
    } catch {
      toast("Connexion impossible.", "error")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="pb-10">
      <ScreenHeader title="Connexion de démonstration" back="/" />
      <div className="flex flex-col gap-5">
        <Section>
          <div className="flex gap-3 rounded-3xl bg-warn-soft p-4 text-sm text-warn">
            <ShieldAlertIcon className="mt-0.5 size-5 shrink-0" aria-hidden />
            <p>
              <strong>Prototype.</strong> Choisissez un profil fictif. Ne saisissez jamais vos vrais identifiants bancaires dans une application de démonstration : aucun champ ne vous les
              demandera ici.
            </p>
          </div>
        </Section>
        <Section title="Profils fictifs">
          <ul className="flex flex-col gap-2">
            {data?.demoProfiles.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => login(p.id)}
                  className="hc-outline flex w-full items-center gap-3 rounded-3xl bg-white p-4 text-left shadow-sm transition hover:shadow-md disabled:opacity-60"
                >
                  <span className="flex size-12 items-center justify-center rounded-full bg-navy font-extrabold text-white">
                    {p.displayName
                      .split(" ")
                      .map((s) => s[0])
                      .join("")}
                  </span>
                  <span className="flex-1">
                    <span className="block font-extrabold text-navy">{p.displayName}</span>
                    <span className="block text-xs text-muted-ink">{p.description}</span>
                  </span>
                  <ChevronRightIcon className="size-5 text-muted-ink" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  )
}
