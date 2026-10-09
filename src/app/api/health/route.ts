import { db } from "@/server/db"
import { providerStatus } from "@/server/llm/providers"

export const dynamic = "force-dynamic"

// Readiness only — booleans and model names, never secrets.
export async function GET() {
  let database = false
  try {
    database = !!db().prepare("SELECT 1 AS ok").get()
  } catch {
    database = false
  }
  const p = providerStatus()
  return Response.json({ database, textProvider: p.text, textModel: p.text ? p.textModel : null, voice: p.voice })
}
