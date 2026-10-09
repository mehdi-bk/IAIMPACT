import { z } from "zod"
import { getPrincipal } from "@/server/auth"
import { AppContextSchema } from "@/server/llm/engine"
import { body, handle } from "@/server/http"
import { executeTool } from "@/server/tools/registry"

// Executes a function call emitted by the Realtime voice model. Same registry,
// same policy layer, same session-derived identity as the text assistant.
const Input = z.object({
  name: z.string().max(60),
  arguments: z.string().max(4000),
  lastUserTranscript: z.string().max(1000).nullish(),
  context: AppContextSchema.nullish(),
})

export const POST = handle(async (req: Request) => {
  const p = await getPrincipal("voice")
  const b = await body(req, Input)
  let args: unknown = {}
  try {
    args = JSON.parse(b.arguments || "{}")
  } catch {
    args = { __invalid_json: true }
  }
  const r = executeTool(b.name, args, p, { app: b.context ?? null, lastUserTranscript: b.lastUserTranscript ?? null })
  return Response.json({
    ok: r.ok,
    label: r.label,
    output: JSON.stringify(r.ok ? r.data : { error: r.error }),
    cards: r.cards,
    ui: r.ui,
    code: r.error?.code ?? null,
  })
})
