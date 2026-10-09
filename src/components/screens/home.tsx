"use client"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  ArrowLeftRightIcon, BellIcon, ChevronRightIcon, CreditCardIcon, HeadsetIcon, ListIcon, MicIcon, ShieldCheckIcon,
  SparklesIcon, LockIcon, LogInIcon, PhoneIcon, AccessibilityIcon,
} from "lucide-react"
import { useAccounts, useCards, useSession, useSpending, useTransactions } from "@/lib/api"
import { askCompass } from "@/lib/compass-client"
import { useCompass } from "@/lib/store"
import { formatEUR, formatSignedEUR, formatShortDate } from "@/lib/format"
import { BankCardVisual, CardStatusPill } from "@/components/bank/bank-card"
import { DemoBadge, Panel, Section, SkeletonRows, TxRow } from "@/components/bank/ui"
import { usePageContext } from "@/components/shell/use-page"
import { useHighlight } from "@/components/shell/highlight"
import { Sheet } from "@/components/shell/sheet"

function CompassBar() {
  return (
    <div className="mx-4 flex items-center gap-2 rounded-full bg-white p-1.5 pl-4 shadow-[0_6px_24px_-10px_rgba(20,35,59,0.35)] ring-1 ring-line">
      <SparklesIcon className="size-5 shrink-0 text-brand" aria-hidden />
      <button
        type="button"
        onClick={() => useCompass.getState().setSheet("open")}
        className="h-11 flex-1 text-left text-[15px] font-medium text-muted-ink"
        aria-label="Écrire à Compass, votre assistant bancaire"
      >
        Que puis-je faire pour vous ?
      </button>
      <button
        type="button"
        onClick={() => {
          useCompass.getState().setSheet("open")
          useCompass.getState().setVoice(true)
        }}
        aria-label="Parler à Compass (conversation vocale)"
        className="flex size-11 items-center justify-center rounded-full bg-navy text-white transition hover:bg-navy-2"
      >
        <MicIcon className="size-5" />
      </button>
    </div>
  )
}

function Greeting({ name, initials, onBell, unread }: { name: string | null; initials: string | null; onBell?: () => void; unread?: boolean }) {
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
  return (
    <div className="flex items-center gap-3 px-4 pb-4 pt-4">
      <Link
        href={name ? "/profil" : "/connexion"}
        aria-label={name ? "Mon profil" : "Se connecter"}
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-extrabold text-white"
      >
        {initials ?? <LogInIcon className="size-5" />}
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-[22px] font-extrabold leading-tight tracking-tight text-navy">{name ? `Bonjour ${name}` : "Bonjour 👋"}</p>
        <p className="text-xs font-medium capitalize text-muted-ink">{today}</p>
      </div>
      {onBell && (
        <button type="button" onClick={onBell} aria-label={`Notifications${unread ? " (nouvelles)" : ""}`} className="relative flex size-11 items-center justify-center rounded-full bg-white text-navy ring-1 ring-line">
          <BellIcon className="size-5" />
          {unread && <span className="absolute right-2.5 top-2.5 size-2.5 rounded-full bg-brand ring-2 ring-white" aria-hidden />}
        </button>
      )}
    </div>
  )
}

function VisitorHome() {
  const tiles = [
    { icon: CreditCardIcon, label: "Carte perdue ou volée", prompt: "J'ai perdu ma carte bancaire" },
    { icon: LockIcon, label: "Accès à mon compte", prompt: "Je n'arrive plus à accéder à mon compte" },
    { icon: ShieldCheckIcon, label: "Sécurité et fraude", prompt: "Comment reconnaître un faux conseiller ?" },
    { icon: PhoneIcon, label: "Nous contacter", prompt: "Comment contacter un conseiller ?" },
  ]
  return (
    <div className="flex flex-col gap-5 pb-8">
      <div className="px-4 pt-3">
        <DemoBadge />
      </div>
      <Greeting name={null} initials={null} />
      <CompassBar />
      <Section>
        <Panel className="flex flex-col gap-3 bg-navy text-white">
          <p className="text-sm font-semibold opacity-80">Mode visiteur</p>
          <p className="text-lg font-extrabold leading-snug">Je peux vous aider à découvrir nos services et à effectuer vos démarches bancaires.</p>
          <Link href="/connexion" className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-white font-bold text-navy hover:bg-surface">
            <LogInIcon className="size-5" aria-hidden /> Accéder à mes comptes
          </Link>
        </Panel>
      </Section>
      <Section title="Démarches courantes">
        <div className="grid grid-cols-2 gap-3">
          {tiles.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => askCompass(t.prompt)}
              className="hc-outline flex min-h-24 flex-col items-start justify-between gap-3 rounded-3xl bg-white p-4 text-left shadow-sm transition hover:shadow-md"
            >
              <t.icon className="size-6 text-brand" aria-hidden />
              <span className="text-sm font-bold leading-tight text-navy">{t.label}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section>
        <Link href="/profil" className="hc-outline flex items-center gap-3 rounded-3xl bg-white p-4 shadow-sm">
          <AccessibilityIcon className="size-6 text-navy" aria-hidden />
          <span className="flex-1 text-sm font-bold text-navy">Accessibilité : taille du texte, contraste, mode simplifié</span>
          <ChevronRightIcon className="size-5 text-muted-ink" aria-hidden />
        </Link>
      </Section>
    </div>
  )
}

export function HomeScreen() {
  usePageContext("accueil")
  const router = useRouter()
  const { data: session, isLoading } = useSession()
  const authed = !!session?.authenticated
  const { data: acc } = useAccounts(authed)
  const { data: cards } = useCards(authed)
  const { data: txs } = useTransactions(authed ? { period: "all" } : null)
  const { data: spend } = useSpending("this_month", authed)
  const [notifOpen, setNotifOpen] = useState(false)
  const balanceHl = useHighlight<HTMLAnchorElement>("balance")
  const spendingHl = useHighlight("spending")

  if (isLoading || !session) {
    return (
      <div className="p-4">
        <SkeletonRows n={6} />
      </div>
    )
  }
  if (!authed) return <VisitorHome />

  const main = acc?.accounts.find((a) => a.type === "COMPTE_COURANT")
  const savings = acc?.accounts.filter((a) => a.type !== "COMPTE_COURANT") ?? []
  const physical = cards?.cards.find((c) => c.kind === "PHYSICAL")
  const recent = txs?.transactions.slice(0, 4) ?? []
  const unknown = txs?.transactions.find((t) => t.id === "tx_cam_inconnu")

  const actions = [
    { icon: ArrowLeftRightIcon, label: "Faire un virement", href: "/virements" },
    { icon: CreditCardIcon, label: "Mes cartes", href: "/cartes" },
    { icon: ListIcon, label: "Mes opérations", href: "/operations" },
    { icon: HeadsetIcon, label: "Contacter un conseiller", href: "/conseiller" },
  ]

  return (
    <div className="flex flex-col gap-5 pb-8">
      <div className="px-4 pt-3">
        <DemoBadge />
      </div>
      <Greeting name={session.customer!.firstName} initials={session.customer!.initials} onBell={() => setNotifOpen(true)} unread={!!unknown} />
      <CompassBar />

      <Section title="Mes comptes" action={<Link href="/comptes" className="text-sm font-bold text-brand">Tout voir</Link>}>
        <div className="flex flex-col gap-3">
          {main ? (
            <Link href={`/comptes?account=${main.id}`} {...balanceHl} className="relative block overflow-hidden rounded-3xl bg-navy p-5 text-white shadow-[0_18px_30px_-16px_rgba(20,35,59,0.7)]">
              <svg aria-hidden className="absolute -right-16 -top-16 size-56 opacity-[0.07]" viewBox="0 0 200 200">
                <circle cx="100" cy="100" r="88" fill="none" stroke="white" strokeWidth="22" />
              </svg>
              <p className="text-sm font-semibold opacity-80">{main.label}</p>
              <p className="tabular mt-1 text-[34px] font-extrabold leading-none tracking-tight">{formatEUR(main.balanceCents)}</p>
              <div className="mt-4 flex items-center justify-between text-xs font-medium opacity-75">
                <span>Solde disponible</span>
                <span className="tabular">{main.maskedIban}</span>
              </div>
            </Link>
          ) : (
            <div className="skeleton h-36 rounded-3xl" />
          )}
          {savings.map((s) => (
            <Link key={s.id} href={`/comptes?account=${s.id}`} className="hc-outline flex items-center justify-between rounded-3xl bg-white p-4 shadow-sm">
              <div>
                <p className="text-sm font-bold text-navy">{s.label}</p>
                <p className="tabular text-xs text-muted-ink">{s.maskedIban}</p>
              </div>
              <p className="tabular text-lg font-extrabold text-navy">{formatEUR(s.balanceCents)}</p>
            </Link>
          ))}
        </div>
      </Section>

      <Section aria-label="Actions rapides">
        <ul className="grid grid-cols-4 gap-2">
          {actions.map((a) => (
            <li key={a.label}>
              <Link href={a.href} className="flex flex-col items-center gap-1.5 rounded-2xl p-1 text-center">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-white text-brand shadow-sm ring-1 ring-line">
                  <a.icon className="size-6" aria-hidden />
                </span>
                <span className="text-[11.5px] font-bold leading-tight text-navy">{a.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {spend && (
        <Section title="Ce mois-ci">
          <Panel {...spendingHl} className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-muted-ink">Dépenses du mois</p>
              <p className="tabular text-2xl font-extrabold text-navy">{formatEUR(spend.spending.totalCents)}</p>
              {spend.spending.previous && (
                <p className="text-xs text-muted-ink">
                  {formatEUR(spend.spending.previous.totalCents)} à la même date le mois dernier
                </p>
              )}
            </div>
            <button type="button" onClick={() => askCompass("Explique-moi mes dépenses de ce mois-ci")} className="shrink-0 rounded-full bg-brand-soft px-3 py-2 text-xs font-bold text-brand">
              Analyser avec Compass
            </button>
          </Panel>
        </Section>
      )}

      {physical && (
        <Section title="Ma carte" action={<Link href="/cartes" className="text-sm font-bold text-brand">Gérer</Link>}>
          <Link href="/cartes" className="hc-outline flex items-center gap-4 rounded-3xl bg-white p-3 shadow-sm">
            <div className="w-28 shrink-0">
              <BankCardVisual card={physical} compact />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-navy">{physical.label}</p>
              <p className="tabular mb-1.5 text-xs text-muted-ink">•••• {physical.maskedNumber}</p>
              <CardStatusPill status={physical.status} />
            </div>
          </Link>
        </Section>
      )}

      <Section title="Dernières opérations" action={<Link href="/operations" className="text-sm font-bold text-brand">Tout voir</Link>}>
        <Panel className="p-2">
          {txs ? recent.map((t) => <TxRow key={t.id} tx={t} onClick={() => router.push(`/operations?tx=${t.id}`)} />) : <SkeletonRows />}
        </Panel>
      </Section>

      <Sheet open={notifOpen} onClose={() => setNotifOpen(false)} title="Notifications">
        <ul className="flex flex-col gap-2">
          {unknown && (
            <li>
              <button
                type="button"
                onClick={() => {
                  setNotifOpen(false)
                  router.push(`/operations?tx=${unknown.id}`)
                }}
                className="flex w-full items-start gap-3 rounded-2xl bg-surface p-3 text-left"
              >
                <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
                <span>
                  <span className="block text-sm font-bold text-navy">Paiement à distance de {formatSignedEUR(unknown.amountCents)}</span>
                  <span className="block text-xs text-muted-ink">
                    {formatShortDate(unknown.timestamp)} · {unknown.label}. Vous ne le reconnaissez pas ? Touchez pour vérifier.
                  </span>
                </span>
              </button>
            </li>
          )}
          <li className="flex items-start gap-3 rounded-2xl p-3">
            <SparklesIcon className="mt-0.5 size-5 shrink-0 text-navy" aria-hidden />
            <span>
              <span className="block text-sm font-bold text-navy">Nouveau : Compass</span>
              <span className="block text-xs text-muted-ink">Dites ce dont vous avez besoin, l&apos;application s&apos;occupe du reste.</span>
            </span>
          </li>
        </ul>
      </Sheet>
    </div>
  )
}
