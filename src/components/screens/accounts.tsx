"use client"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeftRightIcon, ChevronRightIcon, InfoIcon, ListIcon } from "lucide-react"
import { useAccounts, useSession, useSpending, useTransactions } from "@/lib/api"
import { formatEUR } from "@/lib/format"
import { cn } from "@/lib/utils"
import { CategoryIcon, LockedState, Panel, ScreenHeader, Section, SkeletonRows, TxRow } from "@/components/bank/ui"
import { usePageContext } from "@/components/shell/use-page"
import { useHighlight } from "@/components/shell/highlight"

export function AccountsScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const { data: session } = useSession()
  const authed = !!session?.authenticated
  const { data } = useAccounts(authed)
  const accounts = data?.accounts ?? []
  const selected = accounts.find((a) => a.id === params.get("account")) ?? accounts[0]
  usePageContext("comptes", { selectedAccountId: selected?.id ?? null })
  const { data: txs } = useTransactions(authed && selected ? { accountId: selected.id } : null)
  const { data: spend } = useSpending("this_month", authed)
  const spendingHl = useHighlight("spending")

  if (session && !authed)
    return (
      <>
        <ScreenHeader title="Mes comptes" />
        <LockedState what="vos comptes et vos soldes" />
      </>
    )

  const maxCat = Math.max(1, ...(spend?.spending.byCategory.map((c) => c.totalCents) ?? [1]))

  return (
    <div className="pb-8">
      <ScreenHeader title="Mes comptes" />
      <div role="tablist" aria-label="Choisir un compte" className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-4">
        {accounts.map((a) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={a.id === selected?.id}
            onClick={() => router.replace(`/comptes?account=${a.id}`, { scroll: false })}
            className={cn(
              "h-10 shrink-0 rounded-full px-4 text-sm font-bold transition-colors",
              a.id === selected?.id ? "bg-navy text-white" : "bg-white text-navy ring-1 ring-line hover:bg-surface",
            )}
          >
            {a.label}
          </button>
        ))}
      </div>

      {selected ? (
        <div className="flex flex-col gap-5">
          <Section>
            <Panel className="flex flex-col gap-4">
              <div>
                <p className="text-sm font-semibold text-muted-ink">{selected.label}</p>
                <p className="tabular text-[34px] font-extrabold leading-tight tracking-tight text-navy">{formatEUR(selected.balanceCents)}</p>
                <p className="text-xs text-muted-ink">Solde disponible · données fictives</p>
              </div>
              <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-surface p-3 text-xs">
                <div>
                  <dt className="text-muted-ink">IBAN</dt>
                  <dd className="tabular font-bold text-navy">{selected.maskedIban}</dd>
                </div>
                <div>
                  <dt className="text-muted-ink">Statut</dt>
                  <dd className="font-bold text-ok">{selected.status === "OPEN" ? "Ouvert" : "Bloqué"}</dd>
                </div>
                <div>
                  <dt className="text-muted-ink">Titulaire</dt>
                  <dd className="font-bold text-navy">{session?.customer?.displayName}</dd>
                </div>
                <div>
                  <dt className="text-muted-ink">Devise</dt>
                  <dd className="font-bold text-navy">Euro (EUR)</dd>
                </div>
              </dl>
              <div className="grid grid-cols-2 gap-2">
                <Link href={`/operations?account=${selected.id}`} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-navy text-sm font-bold text-white hover:bg-navy-2">
                  <ListIcon className="size-4" aria-hidden /> Opérations
                </Link>
                <Link href="/virements" className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white text-sm font-bold text-navy ring-1 ring-line hover:bg-surface">
                  <ArrowLeftRightIcon className="size-4" aria-hidden /> Virement
                </Link>
              </div>
            </Panel>
          </Section>

          {selected.type === "COMPTE_COURANT" && spend && (
            <Section title="Dépenses du mois">
              <Panel {...spendingHl} className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between">
                  <p className="tabular text-2xl font-extrabold text-navy">{formatEUR(spend.spending.totalCents)}</p>
                  <p className="text-xs text-muted-ink">{spend.spending.count} opérations</p>
                </div>
                <ul className="flex flex-col gap-2.5">
                  {spend.spending.byCategory.slice(0, 5).map((c) => (
                    <li key={c.category} className="flex items-center gap-3">
                      <CategoryIcon category={c.category} className="size-8" />
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between text-xs font-bold text-navy">
                          <span>{c.category}</span>
                          <span className="tabular">{formatEUR(c.totalCents)}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface">
                          <div className="h-full rounded-full bg-navy" style={{ width: `${(c.totalCents / maxCat) * 100}%` }} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="flex items-start gap-1.5 text-[11px] text-muted-ink">
                  <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden /> Calculé à partir de vos opérations, hors épargne et virements internes.
                </p>
              </Panel>
            </Section>
          )}

          <Section title="Opérations récentes" action={<Link href={`/operations?account=${selected.id}`} className="flex items-center text-sm font-bold text-brand">Tout voir <ChevronRightIcon className="size-4" aria-hidden /></Link>}>
            <Panel className="p-2">
              {txs ? txs.transactions.slice(0, 5).map((t) => <TxRow key={t.id} tx={t} onClick={() => router.push(`/operations?tx=${t.id}`)} />) : <SkeletonRows />}
              {txs && !txs.transactions.length && <p className="p-4 text-center text-sm text-muted-ink">Aucune opération.</p>}
            </Panel>
          </Section>
        </div>
      ) : (
        <div className="px-4">
          <SkeletonRows n={5} />
        </div>
      )}
    </div>
  )
}
