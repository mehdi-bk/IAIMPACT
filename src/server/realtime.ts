import "server-only"
import { createHash } from "node:crypto"
import { getPreferences, sessionInfo, type Principal } from "./auth"
import { jsonSchemaOf, toolsFor } from "./tools/registry"
import { VOICE_SYSTEM_PROMPT, contextBlock } from "./llm/prompt"

// Mints a short-lived Realtime client secret server-side. The permanent
// OPENAI_API_KEY never leaves the server. Tools declared to the voice model
// are generated from the SAME registry as the text assistant, and every voice
// function call is executed by /api/realtime/tool with the session principal.

export const realtimeModel = () => process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1"

export class RealtimeError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export async function createRealtimeSecret(p: Principal) {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new RealtimeError(503, "La voix n'est pas configurée (OPENAI_API_KEY manquante côté serveur).")
  const info = sessionInfo(p)
  const prefs = getPreferences(p)
  const instructions = `${VOICE_SYSTEM_PROMPT}

${contextBlock([
  info.customer
    ? `Authentification au démarrage de la conversation vocale (vérifiée par le serveur) : client connecté — prénom ${info.customer.firstName}`
    : "Authentification au démarrage de la conversation vocale (vérifiée par le serveur) : visiteur NON connecté",
  "Ce statut peut changer pendant la conversation : les outils renvoient toujours l'état réel.",
  `Mode simplifié : ${prefs.simplified ? "activé" : "désactivé"}`,
  "Canal : voix (transcription affichée à l'écran)",
])}`

  const session: Record<string, unknown> = {
    type: "realtime",
    model: realtimeModel(),
    instructions,
    audio: {
      input: {
        transcription: { model: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe", language: "fr" },
        turn_detection: { type: "semantic_vad" },
      },
      output: { voice: prefs.voice || "marin" },
    },
    tools: toolsFor("voice").map((t) => ({ type: "function", name: t.name, description: t.description, parameters: jsonSchemaOf(t) })),
    tool_choice: "auto",
  }
  if (process.env.OPENAI_REALTIME_REASONING) session.reasoning = { effort: process.env.OPENAI_REALTIME_REASONING }

  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      // Pseudonymous identifier for abuse monitoring (no personal data).
      "OpenAI-Safety-Identifier": createHash("sha256").update(p.sessionHash).digest("hex").slice(0, 32),
    },
    body: JSON.stringify({ session }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    console.error(`[realtime] client_secrets ${res.status}: ${detail.slice(0, 300)}`)
    throw new RealtimeError(502, "Le service vocal est momentanément indisponible.")
  }
  const data = (await res.json()) as { value?: string; expires_at?: number; client_secret?: { value: string; expires_at: number } }
  const value = data.value ?? data.client_secret?.value
  const expiresAt = data.expires_at ?? data.client_secret?.expires_at
  if (!value) throw new RealtimeError(502, "Réponse inattendue du service vocal.")
  return { value, expiresAt: expiresAt ?? null, model: realtimeModel() }
}
