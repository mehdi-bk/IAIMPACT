import { getPrincipal } from "@/server/auth"
import { spendingSummary } from "@/server/bank"
import { handle } from "@/server/http"

export const GET = handle(async (req: Request) => {
  const p = await getPrincipal()
  const period = new URL(req.url).searchParams.get("period")
  const safe = period === "last_month" || period === "last_30_days" ? period : "this_month"
  return Response.json({ spending: spendingSummary(p, { period: safe, comparePrevious: safe === "this_month" }) })
})
