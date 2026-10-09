"use client"
import { ShieldCheckIcon, SparklesIcon, AccessibilityIcon, MousePointerClickIcon } from "lucide-react"
import { CompassMark } from "@/components/compass/compass-mark"

/** Left column on large screens: product framing for the pitch. */
export function BrandColumn() {
  const pillars = [
    { icon: SparklesIcon, title: "Comprendre", text: "Le client explique son besoin, en texte ou à la voix." },
    { icon: MousePointerClickIcon, title: "Agir", text: "L'application s'adapte et mène au bon écran, à la bonne action." },
    { icon: ShieldCheckIcon, title: "Protéger", text: "Le serveur valide chaque accès. Le client confirme chaque action sensible." },
    { icon: AccessibilityIcon, title: "Inclure", text: "Voix, transcription, mode simplifié, contraste et taille du texte." },
  ]
  return (
    <aside className="hidden w-[300px] shrink-0 flex-col gap-8 2xl:flex" aria-label="Présentation du prototype">
      <div className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-brand text-white shadow-lg">
          <CompassMark className="size-7" />
        </span>
        <div>
          <p className="text-xl font-extrabold tracking-tight text-navy">BPCE Compass</p>
          <p className="text-sm font-medium text-muted-ink">Prototype · AI for Impact</p>
        </div>
      </div>
      <p className="text-[28px] font-extrabold leading-tight tracking-tight text-navy">
        L&apos;assistant bancaire qui <span className="text-brand">comprend</span>, guide et accompagne.
      </p>
      <ul className="flex flex-col gap-4">
        {pillars.map((p) => (
          <li key={p.title} className="flex gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-brand shadow-sm ring-1 ring-line">
              <p.icon className="size-[18px]" aria-hidden />
            </span>
            <div>
              <p className="font-bold text-navy">{p.title}</p>
              <p className="text-sm leading-snug text-muted-ink">{p.text}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-muted-ink">
        Interface inspirée des applications bancaires françaises. Ce n&apos;est pas une application officielle : données 100 % fictives, opérations simulées.
      </p>
    </aside>
  )
}
