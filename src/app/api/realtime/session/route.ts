import { getPrincipal, audit } from "@/server/auth"
import { createRealtimeSecret, RealtimeError } from "@/server/realtime"

export const dynamic = "force-dynamic"

export async function POST() {
  const p = await getPrincipal("voice")
  try {
    const secret = await createRealtimeSecret(p)
    audit(p, "llm", "realtime.session", "ALLOWED", `Clé éphémère émise (${secret.model})`)
    return Response.json(secret, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    const status = e instanceof RealtimeError ? e.status : 500
    const message = e instanceof RealtimeError ? e.message : "Le service vocal est momentanément indisponible."
    audit(p, "llm", "realtime.session", "ERROR", message)
    return Response.json({ error: { code: "VOICE_UNAVAILABLE", message } }, { status })
  }
}
