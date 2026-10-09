import { z } from "zod"
import { getPrincipal } from "@/server/auth"
import { listCards, setCardOption } from "@/server/bank"
import { body, handle } from "@/server/http"

export const GET = handle(async () => Response.json({ cards: listCards(await getPrincipal()) }))

// Low-risk toggles only. Freezing / limits go through /api/actions (prepare -> confirm).
export const PATCH = handle(async (req: Request) => {
  const p = await getPrincipal()
  const b = await body(req, z.object({ cardId: z.string().max(40), option: z.enum(["onlinePayments", "contactless"]), value: z.boolean() }))
  return Response.json({ card: setCardOption(p, b.cardId, b.option, b.value) })
})
