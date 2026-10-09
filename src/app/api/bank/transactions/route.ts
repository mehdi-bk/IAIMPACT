import { getPrincipal } from "@/server/auth"
import { CATEGORIES, getTransaction, listTransactions } from "@/server/bank"
import { handle } from "@/server/http"

export const GET = handle(async (req: Request) => {
  const p = await getPrincipal()
  const u = new URL(req.url).searchParams
  const id = u.get("id")
  if (id) return Response.json({ transaction: getTransaction(p, id.slice(0, 40)) })
  const period = u.get("period")
  const category = u.get("category")
  return Response.json({
    transactions: listTransactions(p, {
      accountId: u.get("accountId")?.slice(0, 40) || undefined,
      query: u.get("q")?.slice(0, 80) || undefined,
      category: category && CATEGORIES.includes(category) ? category : undefined,
      direction: u.get("direction") === "debit" ? "debit" : u.get("direction") === "credit" ? "credit" : undefined,
      period: period === "this_month" || period === "last_month" || period === "last_30_days" ? period : "all",
      limit: 100,
    }),
    categories: CATEGORIES,
  })
})
