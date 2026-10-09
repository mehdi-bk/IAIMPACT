import { z } from "zod"
import { getPrincipal } from "@/server/auth"
import { cancelAction, confirmAction, getPendingAction, latestPendingAction, prepareAction } from "@/server/bank"
import { body, handle } from "@/server/http"

// Sensitive actions from the UI. The SAME prepare/confirm functions back the
// assistant; confirmation is only ever triggered by an explicit user gesture.
const Input = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("prepare"),
    type: z.enum(["CARD_FREEZE", "CARD_UNFREEZE", "CARD_LIMIT_CHANGE", "TRANSFER"]),
    targetId: z.string().max(40),
    params: z
      .object({
        newLimitCents: z.number().int().optional(),
        fromAccountId: z.string().max(40).optional(),
        amountCents: z.number().int().optional(),
        reference: z.string().max(60).optional(),
      })
      .optional(),
  }),
  z.object({ op: z.literal("confirm"), actionId: z.string().max(40), stepUp: z.boolean().optional() }),
  z.object({ op: z.literal("cancel"), actionId: z.string().max(40) }),
])

export const POST = handle(async (req: Request) => {
  const p = await getPrincipal("ui")
  const b = await body(req, Input)
  if (b.op === "prepare") return Response.json({ action: prepareAction(p, b.type, b.targetId, b.params ?? {}) })
  if (b.op === "confirm") return Response.json({ action: confirmAction(p, b.actionId, { stepUp: b.stepUp }) })
  return Response.json({ action: cancelAction(p, b.actionId) })
})

export const GET = handle(async (req: Request) => {
  const p = await getPrincipal("ui")
  const id = new URL(req.url).searchParams.get("id")
  return Response.json({ action: id ? getPendingAction(p, id.slice(0, 40)) : latestPendingAction(p) })
})
