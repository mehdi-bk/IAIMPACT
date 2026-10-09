"use client"
import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CircleHelpIcon, SearchIcon, SparklesIcon, XIcon } from "lucide-react"
import { useSession, useTransaction, useTransactions } from "@/lib/api"
import { askCompass } from "@/lib/compass-client"
import { formatDayLabel, formatSignedEUR } from "@/lib/format"
import { cn } from "@/lib/utils"
import { CategoryIcon, LockedState, Panel, ScreenHeader, SkeletonRows, TxRow } from "@/components/bank/ui"
import { usePageContext } from "@/components/shell/use-page"
import { Sheet } from "@/components/shell/sheet"
import { useCompass } from "@/lib/store"

const PERIODS = [
  { id: "all", label: "Tout" },
  { id: "this_month", label: "Ce mois-ci" },
  { id: "last_month", label: "Mois dernier" },
]
const DIRECTIONS = [
  { id: "", label: "Toutes" },
  { id: "debit", label: "Dépenses" },
  { id: "credit", label: "Revenus" },
]

export function OperationsScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const selectedId = params.get("tx")
  const accountId = params.get("account") ?? undefined
  usePageContext("operations", { selectedTransactionId: selectedId })
  const { data: session } = useSession()
  const authed = !!session?.authenticated
  const [q, setQ] = useState("")
  const [period, setPeriod] = useState("all")
  const [direction, setDirection] = useState("")
  const [category, setCategory] = useState("")
  const { data } = useTransactions(authed ? { accountId, q: q || undefined, period, direction: direction || undefined, category: category || undefined } : null)
  const { data: detail } = useTransaction(authed ? selectedId : null)
  const highlightTx = useCompass((s) => (s.highlight?.target === "transaction" ? selectedId : null))

  const groups = useMemo(() => {
    const out: { day: string; items: NonNullable<typeof data>["transactions"] }[] = []
    for (const t of data?.transactions ?? []) {
      const day = formatDayLabel(t.timestamp)
      const g = out[out.length - 1]
      if (g && g.day === day) g.items.push(t)
      else out.push({ day, items: [t] })
    }
    return out
  }, [data])

  const close = () => router.replace(accountId ? `/operations?account=${accountId}` : "/operations", { scroll: false })

  if (session && !authed)
    return (
      <>
        <ScreenHeader title="Opérations" back="/" />
        <LockedState what="votre historique d'opérations" />
      </>
    )

  const tx = detail?.transaction

  return (
    <div className="pb-8">
      <ScreenHeader title="Opérations" back="/comptes" subtitle={accountId?.includes("livret") ? "Livret A" : "Compte courant"} />
      <div className="sticky top-[60px] z-10 flex flex-col gap-2.5 bg-surface/95 px-4 pb-3 backdrop-blur">
        <label className="flex h-12 items-center gap-2 rounded-2xl bg-white px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-brand">
          <SearchIcon className="size-5 text-muted-ink" aria-hidden />
          <span className="sr-only">Rechercher une opération</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher (commerçant, libellé…)"
            className="h-full flex-1 bg-transparent text-[15px] text-navy outline-none placeholder:text-muted-ink"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Effacer la recherche" className="rounded-full p-1 text-muted-ink hover:text-navy">
              <XIcon className="size-4" />
            </button>
          )}
        </label>
        <div className="no-scrollbar flex gap-2 overflow-x-auto" role="group" aria-label="Filtres">
          {DIRECTIONS.map((d) => (
            <button key={d.id} type="button" aria-pressed={direction === d.id} onClick={() => setDirection(d.id)} className={chip(direction === d.id)}>
              {d.label}
            </button>
          ))}
          <span className="mx-0.5 w-px shrink-0 bg-line" aria-hidden />
          {PERIODS.map((p) => (
            <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)} className={chip(period === p.id)}>
              {p.label}
            </button>
          ))}
          <label className="sr-only" htmlFor="cat">
            Catégorie
          </label>
          <select id="cat" value={category} onChange={(e) => setCategory(e.target.value)} className={cn(chip(!!category), "appearance-none pr-3")}>
            <option value="">Catégories</option>
            {data?.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4" aria-live="polite">
        {!data && <SkeletonRows n={7} />}
        {data && !data.transactions.length && <p className="py-10 text-center text-sm text-muted-ink">Aucune opération ne correspond à votre recherche.</p>}
        {groups.map((g) => (
          <section key={g.day}>
            <h2 className="mb-1 px-1 text-xs font-bold capitalize text-muted-ink">{g.day}</h2>
            <Panel className="p-1.5">
              {g.items.map((t) => (
                <TxRow key={t.id} tx={t} highlighted={highlightTx === t.id} onClick={() => router.replace(`/operations?tx=${t.id}${accountId ? `&account=${accountId}` : ""}`, { scroll: false })} />
              ))}
            </Panel>
          </section>
        ))}
      </div>

      <Sheet open={!!selectedId && !!tx} onClose={close} title="Détail de l'opération">
        {tx && (
          <div className="flex flex-col gap-4" data-highlighted={highlightTx === tx.id ? "true" : undefined}>
            <div className="flex flex-col items-center gap-2 text-center">
              <CategoryIcon category={tx.category} merchant={tx.merchant} className="size-14" />
              <p className="text-base font-bold text-navy">{tx.merchant}</p>
              <p className={cn("tabular text-[32px] font-extrabold tracking-tight", tx.amountCents > 0 ? "text-ok" : "text-navy")}>{formatSignedEUR(tx.amountCents)}</p>
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", tx.status === "PENDING" ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok")}>
                {tx.status === "PENDING" ? "En attente" : tx.amountCents < 0 ? "Débitée" : "Créditée"}
              </span>
            </div>
            <dl className="divide-y divide-line rounded-2xl bg-surface px-4 text-sm">
              {[
                ["Date", new Date(tx.timestamp).toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" })],
                ["Libellé bancaire", tx.label],
                ["Catégorie", tx.category],
                ["Moyen de paiement", tx.channel],
                ["Description", tx.description],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5 py-2.5">
                  <dt className="text-xs text-muted-ink">{k}</dt>
                  <dd className="break-words font-semibold text-navy">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-col gap-2">
              {tx.amountCents < 0 && (
                <button
                  type="button"
                  onClick={() => askCompass("Je ne reconnais pas cette opération.")}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand font-bold text-white hover:bg-brand-strong"
                >
                  <CircleHelpIcon className="size-5" aria-hidden /> Je ne reconnais pas cette opération
                </button>
              )}
              <button
                type="button"
                onClick={() => askCompass("C'est quoi ce paiement ?")}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white font-bold text-navy ring-1 ring-line hover:bg-surface"
              >
                <SparklesIcon className="size-5 text-brand" aria-hidden /> Demander à Compass
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}

function chip(active: boolean) {
  return cn(
    "h-9 shrink-0 rounded-full px-3.5 text-[13px] font-bold transition-colors",
    active ? "bg-navy text-white" : "bg-white text-navy ring-1 ring-line hover:bg-surface",
  )
}
