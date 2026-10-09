import { z } from "zod"
import { getPrincipal } from "@/server/auth"
import { listHandoffs, updateHandoff } from "@/server/bank"
import { body, handle } from "@/server/http"

const Summary = z.object({
  motif: z.string().min(2).max(120),
  operation: z.string().max(200).nullable(),
  situation: z.string().min(2).max(400),
  actions: z.string().max(400),
  demande: z.string().min(2).max(300),
})

export const GET = handle(async () => Response.json({ handoffs: listHandoffs(await getPrincipal()) }))

export const POST = handle(async (req: Request) => {
  const p = await getPrincipal("ui")
  const b = await body(
    req,
    z.discriminatedUnion("op", [
      z.object({ op: z.literal("edit"), id: z.string().max(40), summary: Summary }),
      z.object({ op: z.literal("submit"), id: z.string().max(40) }),
      z.object({ op: z.literal("cancel"), id: z.string().max(40) }),
    ]),
  )
  const h = b.op === "edit" ? updateHandoff(p, b.id, { action: "edit", summary: b.summary }) : updateHandoff(p, b.id, { action: b.op })
  return Response.json({ handoff: h })
})
