import { z } from "zod"
import { getPrincipal } from "@/server/auth"
import { AppContextSchema, ChatInputSchema, runChatTurn, type ChatEvent } from "@/server/llm/engine"
import { body, handle } from "@/server/http"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const Request_ = z.object({
  conversationId: z.string().max(40).nullish(),
  input: ChatInputSchema,
  // Client-side context is a HINT for relevance only. Identity and
  // authorization are derived from the server session, never from here.
  context: AppContextSchema.nullish(),
})

export const POST = handle(async (req: Request) => {
  const principal = await getPrincipal("text")
  const b = await body(req, Request_)
  const encoder = new TextEncoder()
  const abort = new AbortController()
  req.signal.addEventListener("abort", () => abort.abort())

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: ChatEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`))
        } catch {
          /* client went away */
        }
      }
      try {
        await runChatTurn({ principal, conversationId: b.conversationId, input: b.input, app: b.context ?? null, emit, signal: abort.signal })
      } catch (e) {
        console.error("[chat] unexpected:", e instanceof Error ? e.message : e)
        emit({ type: "error", message: "Une erreur inattendue est survenue. Aucune action n'a été effectuée.", retryable: true })
      } finally {
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      abort.abort()
    },
  })
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  })
})
