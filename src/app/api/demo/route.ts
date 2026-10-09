import { z } from "zod"
import { demoLogin, getPrincipal, logout, sessionInfo } from "@/server/auth"
import { db, resetDemoData } from "@/server/db"
import { demoAllowed } from "@/server/demo"
import { body, handle } from "@/server/http"
import { getProvider, providerStatus } from "@/server/llm/providers"
import { createRealtimeSecret } from "@/server/realtime"
import { recentAudit } from "@/server/tools/registry"

export const dynamic = "force-dynamic"

const forbidden = () => Response.json({ error: { code: "FORBIDDEN", message: "Panneau de démonstration indisponible." } }, { status: 403 })

export const GET = handle(async (req: Request) => {
  if (!demoAllowed(req)) return forbidden()
  const p = await getPrincipal()
  const conv = db().prepare("SELECT workflow FROM conversations WHERE session_hash = ? ORDER BY created_at DESC LIMIT 1").get(p.sessionHash) as
    | { workflow: string }
    | undefined
  const card = db().prepare("SELECT status FROM cards WHERE id = 'card_cam_visa'").get() as { status: string } | undefined
  const handoffs = db().prepare("SELECT COUNT(*) AS n FROM support_handoffs WHERE status = 'SUBMITTED_DEMO'").get() as { n: number }
  return Response.json({
    session: sessionInfo(p),
    providers: providerStatus(),
    workflow: conv ? JSON.parse(conv.workflow) : null,
    state: { camilleCard: card?.status ?? "?", submittedHandoffs: handoffs.n },
    trace: recentAudit(60),
  })
})

const Op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("reset_all") }),
  z.object({ op: z.literal("reset_conversations") }),
  z.object({ op: z.literal("login"), profile: z.string().max(30) }),
  z.object({ op: z.literal("logout") }),
  z.object({ op: z.literal("restore_card") }),
  z.object({ op: z.literal("restore_transaction") }),
  z.object({ op: z.literal("test_llm") }),
  z.object({ op: z.literal("test_voice") }),
])

export const POST = handle(async (req: Request) => {
  if (!demoAllowed(req)) return forbidden()
  const b = await body(req, Op)
  switch (b.op) {
    case "reset_all":
      resetDemoData()
      return Response.json({ ok: true, message: "Données de démonstration restaurées." })
    case "reset_conversations":
      db().exec("DELETE FROM conversations; UPDATE pending_actions SET status = 'CANCELLED' WHERE status = 'PENDING';")
      return Response.json({ ok: true, message: "Conversations réinitialisées." })
    case "login":
      return Response.json({ ok: await demoLogin(b.profile), message: `Session : ${b.profile}` })
    case "logout":
      await logout()
      return Response.json({ ok: true, message: "Session visiteur." })
    case "restore_card":
      db().exec("UPDATE cards SET status = 'ACTIVE', payment_limit_cents = 150000 WHERE id = 'card_cam_visa'")
      return Response.json({ ok: true, message: "Carte de Camille réactivée." })
    case "restore_transaction":
      db().exec("UPDATE transactions SET status = 'COMPLETED' WHERE id = 'tx_cam_inconnu'; DELETE FROM support_handoffs;")
      return Response.json({ ok: true, message: "Opération de 89 € restaurée, demandes conseiller effacées." })
    case "test_llm": {
      const started = Date.now()
      try {
        const provider = getProvider()
        let out = ""
        await provider.streamTurn({ system: "Réponds uniquement : OK", messages: [{ role: "user", content: "Test de connectivité." }], tools: [], onText: (d) => (out += d) })
        return Response.json({ ok: true, message: `${provider.name} / ${provider.model} : « ${out.trim().slice(0, 40)} » en ${Date.now() - started} ms` })
      } catch (e) {
        return Response.json({ ok: false, message: `Échec : ${e instanceof Error ? e.message.slice(0, 160) : "erreur"}` })
      }
    }
    case "test_voice":
      try {
        const s = await createRealtimeSecret(await getPrincipal("voice"))
        return Response.json({ ok: true, message: `Clé éphémère obtenue pour ${s.model}` })
      } catch (e) {
        return Response.json({ ok: false, message: e instanceof Error ? e.message : "Échec" })
      }
  }
})
