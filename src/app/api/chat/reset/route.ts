import { z } from "zod"
import { getPrincipal } from "@/server/auth"
import { resetConversation } from "@/server/llm/engine"
import { body, handle } from "@/server/http"

export const POST = handle(async (req: Request) => {
  const p = await getPrincipal()
  const { conversationId } = await body(req, z.object({ conversationId: z.string().max(40).nullish() }))
  if (conversationId) resetConversation(p, conversationId)
  return Response.json({ ok: true })
})
